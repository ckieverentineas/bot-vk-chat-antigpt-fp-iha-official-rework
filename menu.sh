#!/bin/bash

# Создатель скрипта: vk.com/cyrelinx

clear
echo "Добро пожаловать в IHA bot!"
echo "Привет! Это продвинутый запускатель бота. Выбери действие:"
echo "DEV: vk.com/cyrelinx && vk.com/dj.federation"
echo "1. Настройка базы данных"
echo "2. Установка библиотек"
echo "3. Запуск бота"
echo "4. Выход"

read -p "Введи номер действия: " action

animate_loading() {
    echo -n "$1"
    for i in {1..3}; do
        echo -n "."
        sleep 0.5
    done
    echo ""
}

case $action in
    1)
        animate_loading "Настройка базы данных"
        echo "Настройка файла dev.db"
        npx prisma migrate dev --name init
        npx prisma generate
        echo "Успешно!"
        ;;
    2)
        animate_loading "Установка библиотек"
        echo "Установка необходимых библиотек..."
        npm i
        echo "Библиотеки установлены!"
        ;;
    3)
        animate_loading "Запуск бота"
        echo "Запуск бота..."
        npm run start
        ;;
    4)
        animate_loading "Выход из скрипта"
        echo "Выход из скрипта. Пока!"
        exit 0
        ;;
    *)
        echo "Неверный ввод. Попробуй еще раз."
        ;;
esac
