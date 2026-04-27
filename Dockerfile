FROM python:3.12-alpine

RUN apk add --no-cache nginx

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . /usr/share/nginx/html
COPY backend.py /app/backend.py
COPY nginx.conf /etc/nginx/http.d/default.conf
COPY start.sh /app/start.sh

RUN chmod +x /app/start.sh \
    && mkdir -p /run/nginx /data

ENV REPORTS_DB=/data/reports.db

EXPOSE 80

CMD ["/app/start.sh"]
