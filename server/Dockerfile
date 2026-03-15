FROM python:3.11-slim

WORKDIR /app

# System deps for audio/scientific stack and mysql client builds.
RUN apt-get update && apt-get install -y \
    libsndfile1 \
    ffmpeg \
    default-libmysqlclient-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install uv as the Python package manager/runtime helper.
COPY --from=ghcr.io/astral-sh/uv:0.8.22 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
