FROM python:3.12-alpine
WORKDIR /app
COPY app.py version.txt ./
RUN mkdir /data && chown 65534:65534 /data
USER 65534:65534
CMD ["python", "app.py"]
