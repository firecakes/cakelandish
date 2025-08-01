FROM denoland/deno:latest

# Create working directory
WORKDIR /app

# Copy source
COPY . .

# Compile the main app
RUN deno cache main.ts

# expose port 8000
EXPOSE 8000

# Run the app
CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "--unstable-kv", "main.ts"]
