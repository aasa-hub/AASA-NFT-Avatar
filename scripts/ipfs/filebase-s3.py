import os,hashlib,hmac,datetime,urllib.request,urllib.error
AK=os.environ["FILEBASE_ACCESS_KEY"]; SK=os.environ["IPFS_PIN_TOKEN"]
HOST="s3.filebase.com"; REGION="us-east-1"
def sign(key,msg): return hmac.new(key,msg.encode(),hashlib.sha256).digest()
def signed_request(method,path,query="",body=b"",extra_headers=None):
    t=datetime.datetime.now(datetime.timezone.utc)
    amzdate=t.strftime("%Y%m%dT%H%M%SZ"); datestamp=t.strftime("%Y%m%d")
    payload_hash=hashlib.sha256(body).hexdigest()
    headers={"host":HOST,"x-amz-content-sha256":payload_hash,"x-amz-date":amzdate}
    if extra_headers: headers.update(extra_headers)
    signed_headers=";".join(sorted(headers))
    canonical_headers="".join(f"{k}:{headers[k]}\n" for k in sorted(headers))
    canonical_request="\n".join([method,path,query,canonical_headers,signed_headers,payload_hash])
    scope=f"{datestamp}/{REGION}/s3/aws4_request"
    sts="\n".join(["AWS4-HMAC-SHA256",amzdate,scope,hashlib.sha256(canonical_request.encode()).hexdigest()])
    k=sign(("AWS4"+SK).encode(),datestamp); k=sign(k,REGION); k=sign(k,"s3"); k=sign(k,"aws4_request")
    sig=hmac.new(k,sts.encode(),hashlib.sha256).hexdigest()
    headers["Authorization"]=f"AWS4-HMAC-SHA256 Credential={AK}/{scope}, SignedHeaders={signed_headers}, Signature={sig}"
    url=f"https://{HOST}{path}"+("?"+query if query else "")
    req=urllib.request.Request(url,data=body if body else None,method=method,headers=headers)
    try:
        r=urllib.request.urlopen(req,timeout=30); return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e: return e.code, dict(e.headers), e.read()
if __name__=="__main__":
    s,h,b=signed_request("GET","/")
    print("ListBuckets:",s); print(b[:600].decode(errors="replace"))
