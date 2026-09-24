FROM python:3.12-slim

WORKDIR /app

# psycopg2 + fuso horário (scheduler usa America/Sao_Paulo via zoneinfo)
RUN pip install --no-cache-dir psycopg2-binary

COPY . .

# `jobs.py` é a entrada: worker (consome fila) ou scheduler (cria jobs programados)
ENTRYPOINT ["python", "jobs.py"]
CMD ["worker"]
