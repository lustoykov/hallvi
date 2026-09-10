from pathlib import Path
from time import sleep

while True:
    source = Path("/input/job.txt")
    if source.exists():
        output = Path("/output/job.txt")
        pending = output.with_suffix(".tmp")
        pending.write_text(source.read_text() + "@" + Path("version.txt").read_text().strip())
        pending.replace(output)
    Path("/tmp/ready").touch()
    sleep(0.2)
