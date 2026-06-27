"""
GPU-powered embedding server for MemoryForge benchmark.
Uses sentence-transformers on CUDA for ~50x speedup over CPU.

Start: HF_ENDPOINT=https://hf-mirror.com python bench/embed_server.py
Stop:  Ctrl+C
"""

import os, sys, json, numpy as np
from flask import Flask, request, jsonify

# HF mirror for blocked regions
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")

app = Flask(__name__)
model = None


def load_model():
    global model
    from sentence_transformers import SentenceTransformer
    print("[EmbedServer] Loading all-MiniLM-L6-v2 on GPU...", file=sys.stderr)
    model = SentenceTransformer("all-MiniLM-L6-v2", device="cuda")
    # Warmup
    _ = model.encode("warmup")
    print("[EmbedServer] Ready.", file=sys.stderr)


@app.route("/embed", methods=["POST"])
def embed():
    data = request.get_json()
    texts = data.get("texts", [])
    if not texts:
        return jsonify({"vectors": []})
    if isinstance(texts, str):
        texts = [texts]
    # Batch encode on GPU
    vecs = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    return jsonify({"vectors": vecs.tolist()})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ready", "gpu": str(model.device)})


if __name__ == "__main__":
    load_model()
    app.run(host="127.0.0.1", port=8765, debug=False)
