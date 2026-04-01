FROM python:3.11-slim

# Instala Node.js 20 + build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl build-essential \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Node.js deps para o conector WA
COPY wa-connector/package.json wa-connector/
RUN cd wa-connector && npm install --omit=dev

COPY . .
RUN chmod +x start.sh

EXPOSE 8000

CMD ["./start.sh"]
