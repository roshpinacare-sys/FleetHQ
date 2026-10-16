import json, os, subprocess

OUT = "/home/z/my-project/tmp/t8"
RUN = "38145096696"
REPO = "roshpinacare-sys/saos-runtime"

def sh(cmd):
    r = subprocess.run(["bash", "-lc", cmd], capture_output=True, text=True)
    return r.returncode, r.stdout, r.stderr

def pull(path, fn):
    sh('source /home/z/my-project/ghenv.sh && curl -sL -H "Authorization: Bearer $GH_TOKEN" '
       '"https://api.github.com/repos/%s/%s" > %s/%s 2>/dev/null' % (REPO, path, OUT, fn))
    p = os.path.join(OUT, fn)
    return os.path.getsize(p) if os.path.exists(p) else -1

n = pull("actions/runs/%s/jobs" % RUN, "blurt-jobs.json")
print("jobs bytes:", n)
try:
    d = json.load(open(OUT + "/blurt-jobs.json"))
    for job in d.get("jobs", []):
        print("job", job["id"], "|", job["name"], "|", job["conclusion"])
        for s in job.get("steps", []):
            print("   %-44s %s" % (s["name"], s["conclusion"]))
        if job["conclusion"] in ("success", "failure"):
            pull("actions/jobs/%s/logs" % job["id"], "blurt-job-%s.log" % job["id"])
except Exception as e:
    print("parse fail:", e, open(OUT + "/blurt-jobs.json").read()[:150])
