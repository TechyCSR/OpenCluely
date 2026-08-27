const TECHNOLOGY_OPTIONS = {
  database: ['auto', 'mysql', 'postgresql', 'mssql', 'oracle', 'mongodb', 'redis', 'elasticsearch', 'cassandra', 'dynamodb'],
  cloud: ['auto', 'aws', 'azure', 'gcp'],
  containers: ['auto', 'docker', 'kubernetes', 'openshift'],
  infrastructure: ['auto', 'terraform', 'ansible', 'jenkins', 'github-actions']
};

const TECHNOLOGY_LABELS = {
  auto: 'Auto-detect from the question', mysql: 'MySQL', postgresql: 'PostgreSQL', mssql: 'Microsoft SQL Server',
  oracle: 'Oracle Database', mongodb: 'MongoDB', redis: 'Redis', elasticsearch: 'Elasticsearch', cassandra: 'Cassandra',
  dynamodb: 'Amazon DynamoDB', aws: 'AWS', azure: 'Azure', gcp: 'GCP', docker: 'Docker', kubernetes: 'Kubernetes',
  openshift: 'OpenShift', terraform: 'Terraform', ansible: 'Ansible', jenkins: 'Jenkins', 'github-actions': 'GitHub Actions'
};

function isSupportedTechnology(category, value) {
  return TECHNOLOGY_OPTIONS[category]?.includes(value) || false;
}

module.exports = { TECHNOLOGY_OPTIONS, TECHNOLOGY_LABELS, isSupportedTechnology };
