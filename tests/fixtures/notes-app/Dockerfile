FROM python:3.12-alpine
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
USER 65534:65534
CMD ["python", "app.py"]
