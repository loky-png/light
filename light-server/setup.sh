#!/bin/bash
cp nginx.conf /etc/nginx/conf.d/light.conf
systemctl start nginx
systemctl enable nginx
nginx -t && systemctl reload nginx
pm2 delete light 2>/dev/null
PORT=3000 pm2 start dist/index.js --name light-server
pm2 save
echo "Done!"
