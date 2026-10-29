import copy
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from http.server import ThreadingHTTPServer
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import agent

NET = {'ip':'192.168.1.10','prefix':24,'mac':'00-AA-BB-CC-DD-EE','gateway':'192.168.1.1'}
DEV = {'ip':'192.168.1.20','mac':'02:11:22:33:44:55','role':'Dispositivo'}

class InventoryTests(unittest.TestCase):
    def test_baseline_new_device_restart_and_ip_change(self):
        store = {}
        rows, events = agent.reconcile(store, NET, [DEV], 1000)
        self.assertEqual(events, [])
        new = {**DEV, 'ip':'192.168.1.21','mac':'02:11:22:33:44:66'}
        _, events = agent.reconcile(store, NET, [DEV,new], 1030)
        self.assertEqual(len(events), 1)
        store = json.loads(json.dumps(store))
        _, events = agent.reconcile(store, NET, [{**DEV,'ip':'192.168.1.40'},new], 1060)
        self.assertEqual(events, [])
        rows, _ = agent.reconcile(store, NET, [], 1300)
        self.assertTrue(all(not row['recent'] for row in rows))

    def test_new_gateway_is_new_baseline(self):
        store = {}
        gw = {'ip':NET['gateway'],'mac':'00:11:22:33:44:01','role':'Gateway'}
        agent.reconcile(store, NET, [DEV,gw], 1000)
        _, events = agent.reconcile(store, NET, [DEV,{**gw,'mac':'00:11:22:33:44:02'}], 1030)
        self.assertEqual(events, [])

    def test_unknown_gateway_migrates_without_duplicate_alerts(self):
        store = {}
        agent.reconcile(store, NET, [DEV], 1000)
        gw = {'ip':NET['gateway'],'mac':'00:11:22:33:44:01','role':'Gateway'}
        _, events = agent.reconcile(store, NET, [DEV,gw], 1030)
        self.assertEqual(len(events),1)
        self.assertEqual(events[0]['mac'],gw['mac'])
        _, events = agent.reconcile(store, NET, [DEV], 1060)
        self.assertEqual(events,[])

    def test_probe_scope(self):
        self.assertEqual(len(agent.probe_targets(NET)),253)
        with self.assertRaises(ValueError): agent.probe_targets({**NET,'prefix':16})
        with self.assertRaises(ValueError): agent.probe_targets({**NET,'ip':'8.8.8.8'})

    def test_push_endpoint_validation(self):
        sub={'endpoint':'https://web.push.apple.com/a','keys':{'auth':'a'*22,'p256dh':'b'*87}}
        self.assertTrue(agent.valid_subscription(sub))
        for url in ['http://web.push.apple.com/a','https://127.0.0.1/a', 'https://web.push.apple.com.evil.test/a', 'https://web.push.apple.com:8443/a', 'https://user@web.push.apple.com/a']:
            self.assertFalse(agent.valid_subscription({**sub,'endpoint':url}))

class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),agent.make_handler('test-secret',8765))
        cls.url='http://127.0.0.1:'+str(cls.server.server_port)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join()
    def request(self,path,auth=None,host='localhost:8765',data=None):
        headers={'Host':host}
        if auth: headers['Authorization']='Bearer '+auth
        return urlopen(Request(self.url+path,headers=headers,data=data),timeout=2)
    def test_private_api_and_host(self):
        for auth,host,expected in [(None,'localhost:8765',401),('wrong','localhost:8765',401),('test-secret','attacker.test',403)]:
            with self.assertRaises(HTTPError) as ctx:self.request('/api/status',auth,host)
            self.assertEqual(ctx.exception.code,expected)
        with self.request('/api/status','test-secret') as result:
            self.assertIn('devices',json.load(result))
            self.assertEqual(result.headers['Cache-Control'],'no-store')
    def test_no_private_files_or_traversal(self):
        for path in ['/agent.py','/data/token.txt','/../agent.py']:
            with self.assertRaises(HTTPError) as ctx:self.request(path)
            self.assertEqual(ctx.exception.code,404)
    def test_assets(self):
        for path in ['/','/app.js','/style.css','/sw.js','/manifest.webmanifest','/icon-192.png','/icon-512.png']:
            with self.request(path) as response:self.assertEqual(response.status,200)
    def test_bad_subscription(self):
        with self.assertRaises(HTTPError) as ctx:self.request('/api/subscribe','test-secret',data=b'{}')
        self.assertEqual(ctx.exception.code,400)

if __name__=='__main__':unittest.main()
