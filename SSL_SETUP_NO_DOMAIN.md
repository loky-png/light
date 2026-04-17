# Настройка SSL без домена (самоподписанный сертификат)

## Шаг 1: Создать сертификат на сервере

Подключись к серверу и выполни:

```bash
# Создать директорию для сертификатов
sudo mkdir -p /etc/nginx/ssl

# Сгенерировать самоподписанный сертификат на 10 лет
sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/light.key \
  -out /etc/nginx/ssl/light.crt \
  -subj "/C=RU/ST=Moscow/L=Moscow/O=Light Messenger/CN=155.212.167.68"

# Установить правильные права
sudo chmod 600 /etc/nginx/ssl/light.key
sudo chmod 644 /etc/nginx/ssl/light.crt
```

## Шаг 2: Обновить nginx конфигурацию

```bash
cd /opt/light-server/light-server
git pull

# Отредактировать nginx.conf - раскомментировать SSL строки
sudo nano /opt/light-server/light-server/nginx.conf
```

Раскомментируй эти строки (убери `#`):
```nginx
ssl_certificate /etc/nginx/ssl/light.crt;
ssl_certificate_key /etc/nginx/ssl/light.key;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers HIGH:!aNULL:!MD5;
ssl_prefer_server_ciphers on;
```

Также раскомментируй перенаправление HTTP → HTTPS:
```nginx
if ($scheme = http) {
    return 301 https://$server_name$request_uri;
}
```

## Шаг 3: Применить конфигурацию

```bash
# Скопировать конфиг в nginx
sudo cp /opt/light-server/light-server/nginx.conf /etc/nginx/conf.d/light.conf

# Проверить конфигурацию
sudo nginx -t

# Если ошибок нет - перезапустить nginx
sudo systemctl restart nginx

# Проверить статус
sudo systemctl status nginx
```

## Шаг 4: Обновить сервер

```bash
cd /opt/light-server/light-server
npm run build
pm2 restart light-server
```

## Шаг 5: Настроить Electron клиент

В `light-client/electron/main.ts` добавь в начало файла (после импортов):

```typescript
// Отключить проверку самоподписанных сертификатов (ТОЛЬКО для разработки!)
app.commandLine.appendSwitch('ignore-certificate-errors')
```

## Шаг 6: Обновить все URL в клиенте

Заменить во ВСЕХ файлах:
- `http://155.212.167.68:80` → `https://155.212.167.68`
- `ws://155.212.167.68` → `wss://155.212.167.68`

Файлы для изменения:
- `light-client/src/api/socket.ts`
- `light-client/src/App.tsx`
- `light-client/src/components/Sidebar.tsx`
- `light-client/src/components/ChatWindow.tsx`
- `light-client/src/components/Login.tsx`

## Проверка

После всех изменений:

1. На сервере:
```bash
# Проверить что nginx слушает 443 порт
sudo netstat -tlnp | grep :443

# Проверить что сертификат работает
curl -k https://155.212.167.68/api/auth/validate
```

2. На клиенте:
- Пересобрать приложение
- Запустить и проверить что соединение работает
- В DevTools не должно быть ошибок SSL

## Важно!

⚠️ **Самоподписанный сертификат:**
- Браузеры будут показывать предупреждение (это нормально)
- Для Electron с `ignore-certificate-errors` работает без проблем
- Данные все равно шифруются (защита от перехвата)
- Для продакшена лучше купить домен и использовать Let's Encrypt

⚠️ **Безопасность:**
- `ignore-certificate-errors` использовать ТОЛЬКО для своего сервера
- Не публиковать приложение с этой настройкой
- Для публичного релиза нужен настоящий сертификат

## Альтернатива: Купить дешевый домен

Если хочешь нормальный SSL:
1. Купить домен на Namecheap/GoDaddy (~$1-5/год)
2. Настроить A-запись на 155.212.167.68
3. Использовать Let's Encrypt (бесплатно):
```bash
sudo certbot --nginx -d your-domain.com
```

Let's Encrypt автоматически настроит nginx и будет обновлять сертификат.
