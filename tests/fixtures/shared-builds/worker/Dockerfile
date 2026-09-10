FROM python:3.12-alpine
WORKDIR /worker
COPY worker.py version.txt ./
RUN mkdir /output && chown 65534:65534 /output
USER 65534:65534
CMD ["python", "worker.py"]
