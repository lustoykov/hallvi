FROM python:3.12-alpine
WORKDIR /app
COPY app.py version.txt ./
RUN mkdir /data /documents /results && chown 65534:65534 /data /documents /results
USER 65534:65534
CMD ["python", "app.py"]
