FROM alpine:3.21
RUN apk add --no-cache git git-daemon nginx fcgiwrap spawn-fcgi apache2-utils bash curl
COPY nginx.conf /etc/nginx/http.d/default.conf
COPY entrypoint.sh /entrypoint.sh
COPY post-receive /usr/local/share/glassine/post-receive
RUN chmod +x /entrypoint.sh
EXPOSE 80
ENTRYPOINT ["/entrypoint.sh"]
