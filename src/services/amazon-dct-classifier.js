const DOMAIN_RULES = [
  ['leadership-principles', /\b(leadership principle|customer obsession|ownership|bias for action|dive deep|earn trust|highest standards|deliver results|learn and be curious)\b/i],
  ['star', /\b(tell me about a time|describe a time|give an example|situation|star)\b/i],
  ['hr', /\b(tell me about yourself|why amazon|why dct|strengths?|weaknesses?|career goals?|relocat|shift work|night shift)\b/i],
  ['boot-provisioning', /\b(bios|uefi|post code|power-on self-test|grub|pxe|network boot|mbr|gpt|bootloader)\b/i],
  ['virtualization', /\b(virtuali[sz]ation|hypervisor|type 1|type 2|vmware|esxi|virtual machine|containeri[sz]ation|container|edge computing)\b/i],
  ['storage', /\b(raid|storage|disk|drive|array|rebuild|controller|backup)\b/i],
  ['architecture', /\b(32-bit|64-bit|cpu|processor|clock speed|risc|cisc|cache|ddr[45]|ecc|virtual memory|paging|swapping|zombie|orphan process|nice value)\b/i],
  ['windows-ad', /\b(active directory|group policy|gpo|domain join|windows server|domain controller)\b/i],
  ['aws', /\b(aws|ec2|vpc|iam|s3|availability zone|security group)\b/i],
  ['security', /\b(least privilege|authentication|authorization|vulnerabilit|physical security|incident response|access control)\b/i],
  ['linux', /\b(linux|systemd|journalctl|chmod|chown|ssh|filesystem|mount|process|top|ps |df |du )\b/i],
  ['hardware', /\b(cpu|ram|memory module|raid|psu|power supply|nic|motherboard|drive failure|disk replacement|server component)\b/i],
  ['datacenter', /\b(data ?center|rack|rack and stack|cabling|fiber|copper|cooling|esd|pdu|ups|inventory)\b/i],
  ['networking', /\b(network|tcp\/?ip|osi|dns|dhcp|vlan|switch|router|routing|arp|subnet|gateway|nat|packet loss|ping|traceroute|ip address)\b/i],
  ['troubleshooting', /\b(troubleshoot|not working|cannot|can't|won't boot|unreachable|failure|alarm|high cpu|high memory)\b/i]
];

function classifyAmazonDctQuestion(text = '') {
  const question = String(text).trim();
  const domain = DOMAIN_RULES.find(([, pattern]) => pattern.test(question))?.[0] || 'general-technical';
  const type = ['leadership-principles', 'star'].includes(domain) ? 'behavioral' : domain === 'hr' ? 'hr' : 'technical';
  const troubleshooting = domain === 'troubleshooting' || /\b(troubleshoot|failure|unreachable|cannot|can't|not working|won't)\b/i.test(question);
  const difficulty = /\b(explain|what is|define|basic)\b/i.test(question) ? 'foundational' : /\b(design|compare|root cause|complex|intermittent|outage)\b/i.test(question) ? 'advanced' : 'intermediate';
  return { domain, type, difficulty, troubleshooting, requiresCommands: type === 'technical' && (troubleshooting || ['networking', 'linux', 'windows-ad'].includes(domain)) };
}

function formatAmazonDctRoutingContext(text) {
  const classification = classifyAmazonDctQuestion(text);
  return `\n\n## Internal question routing\nClassify this request internally as:\n- Domain: ${classification.domain}\n- Type: ${classification.type}\n- Difficulty: ${classification.difficulty}\n- Troubleshooting flow required: ${classification.troubleshooting ? 'yes' : 'no'}\n- Commands useful: ${classification.requiresCommands ? 'yes' : 'no'}\nDo not print this routing block or JSON in the answer. Use it to select the response strategy.`;
}

module.exports = { classifyAmazonDctQuestion, formatAmazonDctRoutingContext };
