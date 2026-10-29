import os, json, urllib.request, urllib.error
key = os.environ["KEY"]
base = "https://openrouter.ai/api/v1"
def call(model, max_tokens):
    payload = {"model": model, "temperature": 0.2,
               "messages": [{"role":"system","content":"You are a test. Return JSON."},
                            {"role":"user","content":"Return JSON object with key ok=true."}],
               "response_format": {"type":"json_object"}}
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens
    req = urllib.request.Request(base+"/chat/completions", data=json.dumps(payload).encode(), method="POST",
                                 headers={"Authorization":"Bearer "+key,"Content-Type":"application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            d = json.loads(resp.read().decode())
        return {"status": resp.status, "finish": d.get("choices",[{}])[0].get("finish_reason"),
                "content_len": len(d.get("choices",[{}])[0].get("message",{}).get("content","")),
                "usage": d.get("usage")}
    except urllib.error.HTTPError as e:
        return {"status": e.code, "body": e.read().decode()[:600]}
    except Exception as e:
        return {"error": str(e)}

cases = [
  ("deepseek/deepseek-v4-flash-vision-exp", 3500),
  ("deepseek/deepseek-v4-flash-vision-exp", None),
  ("deepseek/deepseek-chat-v3-0324", 3500),
]
for model, mt in cases:
    print(f"MODEL={model} max_tokens={mt}:")
    print(json.dumps(call(model, mt)))
    print("---")
