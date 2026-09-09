import concurrent.futures,json,pathlib,sqlite3,subprocess,urllib.request,urllib.error,re
root=pathlib.Path('/recovered')
c=sqlite3.connect('file:/recovered/database/server-guy.db?mode=ro&immutable=1',uri=True)
apps=[json.loads(r[0]) for r in c.execute('select body from deployments')];c.close()
hetzner=json.loads((root/'config/hetzner-connection.json').read_text())
github=json.loads((root/'config/github-connection.json').read_text())
def get(url, token=None):
 req=urllib.request.Request(url,headers={'User-Agent':'Server-Guy-Recovery-Rehearsal','Authorization':'Bearer '+token} if token else {'User-Agent':'Server-Guy-Recovery-Rehearsal'})
 try:
  with urllib.request.urlopen(req,timeout=20) as response:
   body=response.read();return response.status,json.loads(body) if 'json' in response.headers.get('Content-Type','') else None
 except urllib.error.HTTPError as e:return e.code,None
 except Exception:return 'unreachable',None

def ssh_args(app,known=None):
 directory=root/'config/deployments'/app['id']
 return ['ssh','-i',str(directory/'client'),'-o','UserKnownHostsFile='+str(known or directory/'known_hosts'),'-o','StrictHostKeyChecking=yes','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','ConnectTimeout=10','root@'+app['address']]

def probe(app):
 assert re.fullmatch('[0-9a-f-]{36}',app['id'])
 status,server=get('https://api.hetzner.cloud/v1/servers/'+str(app['serverId']),hetzner['token'])
 identity=status==200 and server['server']['public_net']['ipv4']['ip']==app['address']
 cmd="docker ps --filter label=com.docker.compose.project=sg-"+app['id'][:8]+" --format '{{.Names}}:{{.Status}}'"
 remote=subprocess.run(ssh_args(app)+[cmd],capture_output=True,text=True,timeout=30)
 public,_=get(app['url'])
 return {'deploymentId':app['id'],'hetznerStatus':status,'hostIdentityMatches':identity,'sshVerified':remote.returncode==0,'services':remote.stdout.strip().splitlines() if remote.returncode==0 else [],'publicHTTP':public}
status,account=get('https://api.github.com/user',github.get('token'))
result={'github':{'status':status,'accountMatches':status==200 and account.get('login')==github.get('account',{}).get('login'),'refreshAttempted':False},'hosts':list(concurrent.futures.ThreadPoolExecutor(3).map(probe,apps))}
subprocess.run(['ssh-keygen','-q','-t','ed25519','-N','','-f','/tmp/rehearsal-wrong-key'],check=True,capture_output=True)
wrong=pathlib.Path('/tmp/wrong-known-hosts');wrong.write_text(apps[0]['address']+' '+pathlib.Path('/tmp/rehearsal-wrong-key.pub').read_text())
r=subprocess.run(ssh_args(apps[0],wrong)+['true'],capture_output=True,text=True,timeout=20)
result['wrongHostKeyRejected']=r.returncode!=0 and 'HOST IDENTIFICATION HAS CHANGED' in r.stderr
print(json.dumps(result,indent=2))
