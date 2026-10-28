FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
COPY frontend/package*.json frontend/
RUN npm ci
COPY frontend frontend
RUN npm run build -w frontend

FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
