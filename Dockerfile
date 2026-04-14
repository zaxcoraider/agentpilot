# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
# VITE_API_URL not needed — frontend and backend share the same origin
RUN npm run build

# Stage 2: Build backend
FROM node:20-alpine AS backend-build
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --include=dev
COPY backend/ .
RUN npm run build

# Stage 3: Production image
FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY --from=backend-build /app/dist ./dist
# Frontend dist served as static files by Express
COPY --from=frontend-build /frontend/dist ./public

EXPOSE 3001
CMD ["node", "dist/index.js"]
