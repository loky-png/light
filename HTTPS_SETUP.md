# Настройка HTTPS для Light Messenger

## Зачем нужен HTTPS?
- Защита паролей и токенов при передаче
- Защита от перехвата сообщений
- Безопасное WebSocket соединение (WSS)
- Доверие пользователей

## Шаги настройки:

### 1. Получить SSL сертификат (Let's Encrypt - бесплатно)

На сервере выполнить:

```bash
# Установить certbot
sudo dnf install certbot python3-certbot-nginx -y

# Получить сертификат для домена
sudo certbot --nginx -d your-domain.com

# Certbot автоматически настроит nginx
```

### 2. Если нет домена - использовать самоподписанный сертификат (для тестирования)

```bash
# Создать директорию для сертификатов
sudo mkdir -p /etc/nginx/ssl

# Сгенерировать самоподписанный сертификат
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/light.key \
  -out /etc/nginx/ssl/light.crt \
  -subj "/C=RU/ST=Moscow/L=Moscow/O=Light/CN=155.212.167.68"
```

### 3. Обновить nginx.conf

```nginx
server {
    listen 80;
    listen 443 ssl http2;
    server_name 155.212.167.68;

    # SSL сертификаты
    ssl_certificate /etc/nginx/ssl/light.crt;
    ssl_certificate_key /etc/nginx/ssl/light.key;

    # SSL настройки
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Перенаправление HTTP на HTTPS
    if ($scheme = http) {
        return 301 https://$server_name$request_uri;
    }

    # WebSocket для Socket.IO
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    # REST API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 4. Применить изменения

```bash
# Проверить конфигурацию
sudo nginx -t

# Перезапустить nginx
sudo systemctl restart nginx

# Проверить что nginx запущен
sudo systemctl status nginx
```

### 5. Обновить клиент

Изменить все URL в клиенте:
- `http://155.212.167.68:80` → `https://155.212.167.68`
- `ws://155.212.167.68` → `wss://155.212.167.68`

Файлы для изменения:
- `light-client/src/api/socket.ts`
- `light-client/src/App.tsx`
- `light-client/src/components/Sidebar.tsx`
- `light-client/src/components/ChatWindow.tsx`
- `light-client/src/components/Login.tsx`

### 6. Для самоподписанного сертификата

В Electron нужно отключить проверку сертификата (ТОЛЬКО для разработки!):

```typescript
// В main.ts
app.commandLine.appendSwitch('ignore-certificate-errors')
```

## Проверка

После настройки:
1. Открыть https://155.212.167.68 в браузере
2. Проверить что соединение защищено (замок в адресной строке)
3. Проверить что WebSocket работает через WSS

## Важно!

- Самоподписанный сертификат - ТОЛЬКО для разработки
- Для продакшена использовать Let's Encrypt или купленный сертификат
- Регулярно обновлять сертификаты (Let's Encrypt автоматически)
