"""Local inspection server; artifacts are written only inside the named audit root."""
import argparse,base64,json,re
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
parser=argparse.ArgumentParser();parser.add_argument('--directory',default='dist');parser.add_argument('--out',required=True);parser.add_argument('--port',type=int,default=4334)
args=parser.parse_args();audit=Path(args.out).resolve();audit.mkdir(parents=True,exist_ok=True)
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=args.directory,**kw)
 def do_POST(self):
  if self.path!='/__qa__/capture':return self.send_error(404)
  try:
   size=int(self.headers.get('Content-Length','0'))
   if size>20000000:raise ValueError('Capture too large')
   row=json.loads(self.rfile.read(size));run=row['pass']
   if not re.fullmatch('[a-z0-9-]+',run):raise ValueError('Invalid pass')
   dest=audit/run;dest.mkdir(exist_ok=True)
   kind=row['kind'];name=row.get('name')
   if kind in ('view','sheet'):
    if not re.fullmatch('(view|sheet)-[0-9]+',name or ''):raise ValueError('Invalid capture name')
    encoded=row.pop('image');prefix='data:image/jpeg;base64,'
    if not encoded.startswith(prefix):raise ValueError('Expected JPEG capture')
    (dest/(name+'.jpg')).write_bytes(base64.b64decode(encoded[len(prefix):],validate=True));(dest/(name+'.json')).write_text(json.dumps(row,indent=2))
   elif kind=='plan':(dest/'plan.json').write_text(json.dumps(row['plan'],indent=2))
   elif kind=='error':
    with (dest/'errors.jsonl').open('a') as f:f.write(json.dumps(row)+'\n')
   elif kind=='excluded':
    with (dest/'excluded.jsonl').open('a') as f:f.write(json.dumps(row)+'\n')
   else:raise ValueError('Invalid capture kind')
   self.send_response(200);self.end_headers();self.wfile.write(b'ok')
  except Exception as error:self.send_error(400,str(error))
ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
