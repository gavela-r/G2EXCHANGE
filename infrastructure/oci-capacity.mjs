import { createHash, createPrivateKey, sign } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { pathToFileURL } from 'node:url';

const REGION = 'eu-madrid-1';
const AD = 'ByXX:EU-MADRID-1-AD-1';
const NAME = 'g2exchange-api-db';
const SHAPE = 'VM.Standard.A1.Flex';
const AGE_LIMIT = 20 * 60 * 60 * 1000;
const sha = value => createHash('sha256').update(value).digest('hex');
const ensure = (condition, message) => { if (!condition) throw new Error(message); };

export function validateConfig(raw, campaignStart, now = Date.now()) {
  let c;
  try { c = JSON.parse(raw); } catch { throw new Error('Invalid secret JSON; values suppressed'); }
  for (const key of ['tenancy', 'user', 'fingerprint', 'privateKey', 'compartment', 'subnet', 'image', 'sshPublicKey']) {
    ensure(typeof c[key] === 'string' && c[key].length > 0, `Missing configuration: ${key}`);
  }
  for (const [key, type] of [['tenancy','tenancy'], ['user','user'], ['subnet','subnet'], ['image','image']]) {
    ensure(c[key].startsWith(`ocid1.${type}.`), `Invalid OCID type: ${key}`);
  }
  ensure(c.compartment === c.tenancy || c.compartment.startsWith('ocid1.compartment.'), 'Invalid compartment');
  ensure(c.sshPublicKey.startsWith('ssh-ed25519 ') && !c.sshPublicKey.includes('\n'), 'Invalid SSH public key');
  ensure(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(campaignStart || ''), 'Campaign start must be UTC ISO timestamp');
  const start = Date.parse(campaignStart);
  ensure(Number.isFinite(start) && now >= start && now - start < AGE_LIMIT, 'Campaign inactive or expired; review before starting another campaign');
  ensure(createPrivateKey(c.privateKey).asymmetricKeyType === 'rsa', 'OCI API key must be RSA');
  c.token = sha(`g2exchange-madrid-${campaignStart}`);
  return c;
}

export function launchPayload(c) {
  return {
    availabilityDomain: AD,
    compartmentId: c.compartment,
    displayName: NAME,
    shape: SHAPE,
    shapeConfig: { ocpus: 1, memoryInGBs: 6 },
    sourceDetails: { sourceType: 'image', imageId: c.image, bootVolumeSizeInGBs: 50, bootVolumeVpusPerGB: 10 },
    createVnicDetails: { subnetId: c.subnet, assignPublicIp: true, assignIpv6Ip: false, assignPrivateDnsRecord: true },
    metadata: { ssh_authorized_keys: c.sshPublicKey },
    instanceOptions: { areLegacyImdsEndpointsDisabled: true },
    isPvEncryptionInTransitEnabled: true,
    freeformTags: { project: 'G2EXCHANGE', provisioning: 'bounded-capacity-retry' },
    agentConfig: { isManagementDisabled: true, isMonitoringDisabled: false, pluginsConfig: [
      { name: 'Compute Instance Monitoring', desiredState: 'ENABLED' },
      ...['Custom Logs Monitoring', 'Compute Instance Run Command', 'Cloud Guard Workload Protection', 'Bastion', 'Vulnerability Scanning', 'OS Management Hub Agent', 'Management Agent'].map(name => ({ name, desiredState: 'DISABLED' }))
    ] }
  };
}

// This is only a resource guard. It is not a provider billing cap or IAM boundary.
export function checkInventory(instances, volumes) {
  const alive = instances.filter(i => i.lifecycleState !== 'TERMINATED');
  if (alive.some(i => i.displayName === NAME)) return 'exists';
  ensure(!alive.some(i => i.shape === SHAPE), 'Existing A1 allocation: review aggregate free allowance');
  const retained = volumes.filter(v => v.lifecycleState !== 'TERMINATED');
  ensure(!retained.some(v => (v.displayName || '').includes(NAME)), 'Potential orphan boot volume: manual review required');
  ensure(retained.every(v => Number.isFinite(v.sizeInGBs) && v.sizeInGBs >= 0), 'Unknown volume size');
  ensure(retained.reduce((n, v) => n + v.sizeInGBs, 0) + 50 <= 200, 'Would exceed aggregate 200 GB storage allowance');
  return 'clear';
}

export function isCapacityError(error) {
  return error?.status === 500 && error?.code === 'InternalError' && /out of (?:host )?capacity/i.test(error.safeMessage || '');
}

export function api(c, method, path, payload, retryToken) {
  const host = path.startsWith('/20160918/compartments?') || path === '/20160918/regions'
    ? `identity.${REGION}.oci.oraclecloud.com` : `iaas.${REGION}.oraclecloud.com`;
  const body = payload === undefined ? undefined : JSON.stringify(payload);
  const headers = { host, 'x-date': new Date().toUTCString() };
  const names = ['(request-target)', 'host', 'x-date'];
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    headers['content-length'] = String(Buffer.byteLength(body));
    headers['x-content-sha256'] = createHash('sha256').update(body).digest('base64');
    names.push('x-content-sha256', 'content-type', 'content-length');
  }
  if (retryToken) { headers['opc-retry-token'] = retryToken; names.push('opc-retry-token'); }
  const canonical = names.map(n => `${n}: ${n === '(request-target)' ? method.toLowerCase() + ' ' + path : headers[n]}`).join('\n');
  const signature = sign('RSA-SHA256', Buffer.from(canonical), c.privateKey).toString('base64');
  headers.authorization = `Signature version="1",keyId="${c.tenancy}/${c.user}/${c.fingerprint}",algorithm="rsa-sha256",headers="${names.join(' ')}",signature="${signature}"`;
  return new Promise((resolve, reject) => {
    const req = httpsRequest({ hostname: host, method, path, headers, timeout: 45000 }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        data += chunk;
        if (data.length > 8 * 1024 * 1024) res.destroy(new Error('Response too large'));
      });
      res.on('error', () => reject(new Error('Network response failed; review before further requests')));
      res.on('end', () => {
        let parsed;
        try { parsed = data ? JSON.parse(data) : null; } catch { reject(new Error('Invalid API response')); return; }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve({ data: parsed, next: res.headers['opc-next-page'] });
        else {
          const e = new Error(`OCI request failed: HTTP ${res.statusCode}; code ${String(parsed?.code || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '')}`);
          e.status = res.statusCode; e.code = parsed?.code; e.safeMessage = parsed?.message;
          reject(e);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', () => reject(new Error('Network error; launch outcome may be ambiguous')));
    if (body !== undefined) req.write(body);
    req.end();
  });
}

async function list(c, route, params) {
  const items = [];
  let next;
  do {
    const q = new URLSearchParams(params);
    if (next) q.set('page', next);
    const r = await api(c, 'GET', `/20160918/${route}?${q}`);
    ensure(Array.isArray(r.data), 'Unexpected list response');
    items.push(...r.data);
    next = r.next;
  } while (next);
  return items;
}

export async function run(c, transport = api, listing = list) {
  const image = (await transport(c, 'GET', `/20160918/images/${encodeURIComponent(c.image)}`)).data;
  ensure(image.lifecycleState === 'AVAILABLE' && /^Canonical-Ubuntu-24\.04-Minimal-aarch64-/.test(image.displayName || ''), 'Image is not the approved Ubuntu Arm family');
  const subnet = (await transport(c, 'GET', `/20160918/subnets/${encodeURIComponent(c.subnet)}`)).data;
  ensure(subnet.lifecycleState === 'AVAILABLE' && !subnet.prohibitPublicIpOnVnic, 'Subnet unavailable or private');
  // The API identity must be able to enumerate all compartments, not only its own.
  // The tenancy root is passed separately because ListCompartments excludes root.
  const children = await listing(c, 'compartments', { compartmentId: c.tenancy, compartmentIdInSubtree: 'true', accessLevel: 'ANY', lifecycleState: 'ACTIVE' });
  ensure(children.every(i => typeof i.id === 'string' && i.id.startsWith('ocid1.compartment.')), 'Invalid compartment inventory');
  const compartments = [c.tenancy, ...children.map(i => i.id)];
  ensure(compartments.includes(c.compartment), 'Launch compartment not included in inventory');
  let instances = [], volumes = [];
  for (const compartmentId of new Set(compartments)) {
    instances.push(...await listing(c, 'instances', { compartmentId }));
    volumes.push(...await listing(c, 'bootVolumes', { compartmentId, availabilityDomain: AD }));
    volumes.push(...await listing(c, 'volumes', { compartmentId, availabilityDomain: AD }));
  }
  if (checkInventory(instances, volumes) === 'exists') return 'exists';
  try {
    const result = await transport(c, 'POST', '/20160918/instances', launchPayload(c), c.token);
    ensure(result.data?.displayName === NAME && result.data?.shape === SHAPE && result.data?.id, 'Unexpected launch response; manual review required');
    return 'created';
  } catch (e) {
    if (isCapacityError(e)) return 'capacity';
    throw e;
  }
}

async function disableWorkflow() {
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo } = process.env;
  ensure(token && /^[\w.-]+\/[\w.-]+$/.test(repo || ''), 'Missing GitHub execution context');
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/oci-capacity.yml/disable`, {
    method: 'PUT', headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(20000)
  });
  ensure(res.status === 204, 'Could not disable workflow; disable it manually in Actions');
}

async function main() {
  let result = 'review';
  try {
    const c = validateConfig(process.env.OCI_RETRY_CONFIG, process.env.OCI_CAMPAIGN_START);
    ensure(process.env.OCI_RETRY_ENABLED === 'true', 'Retry campaign not enabled');
    result = await run(c);
    console.log(result === 'capacity' ? 'No A1 capacity. One attempt completed; next scheduled run may retry.' : 'Instance found or launch accepted. Campaign stopping. Verify provisioning in OCI.');
  } catch (e) {
    console.error(`Stopped for review: ${e.message}`);
    process.exitCode = 1;
  } finally {
    if (result !== 'capacity') {
      try { await disableWorkflow(); console.log('Workflow disabled.'); }
      catch (e) { console.error(e.message); process.exitCode = 1; }
    }
  }
}

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
