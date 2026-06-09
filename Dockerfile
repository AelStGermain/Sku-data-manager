FROM nginx:alpine

# Copy static assets to NGINX HTML serving folder
COPY . /usr/share/nginx/html

# Expose port (Koyeb usually listens to whatever is exposed or defaults to 8000/80)
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
