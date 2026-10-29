const {test}=require('node:test');const assert=require('node:assert/strict');
const {stats,subnet,csv}=require('../docs/utils.js');
test('HTTP statistics exclude failures, median and successive valid variation',()=>{
 assert.equal(stats([]),null);const s=stats([10,null,30,20,NaN]);assert.equal(s.mean,20);assert.equal(s.median,20);assert.equal(s.variation,15);assert.equal(s.count,3);assert.equal(stats([5]).variation,null);assert.equal(stats([10,20]).median,15);
});
test('CIDR computes subnet without signed integer overflow',()=>{const s=subnet('192.168.1.20/24');assert.deepEqual(s,{network:'192.168.1.0/24',mask:'255.255.255.0',broadcast:'192.168.1.255',first:'192.168.1.1',last:'192.168.1.254',hosts:254});assert.equal(subnet('255.255.255.255/0').hosts,4294967294);});
test('point-to-point and host routes',()=>{const s=subnet('10.0.0.1/31');assert.equal(s.first,'10.0.0.0');assert.equal(s.last,'10.0.0.1');assert.equal(s.hosts,2);assert.equal(subnet('192.0.2.5/32').hosts,1);});
test('invalid CIDR is rejected',()=>{for(const s of ['256.0.0.1/24','1.2.3.4/33','1.2.3/24','bad'])assert.throws(()=>subnet(s));});
test('CSV escapes quotes and neutralizes spreadsheet formula prefixes',()=>{const result=csv([['=1+1','a,"b','normal','@SUM(A1)']]);assert.ok(result.includes('"\'=1+1"'));assert.ok(result.includes('"a,""b"'));assert.ok(result.includes('"\'@SUM(A1)"'));});
