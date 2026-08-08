import dns from 'node:dns';
import net from 'node:net';

// WSL often advertises AAAA but cannot route IPv6; undici Happy Eyeballs then
// ETIMEDOUT on outbound HTTPS (e.g. api.tavily.com) while curl (IPv4) works.
// Import this module first from the process entrypoint.
dns.setDefaultResultOrder('ipv4first');
if (typeof net.setDefaultAutoSelectFamily === 'function') {
  net.setDefaultAutoSelectFamily(false);
}
