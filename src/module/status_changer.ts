import { vks, vks_info } from "..";
import { createLogger } from "./logger";

export async function updateStatuses() {
    for (let i = 0; i < vks.length; i++) {
        const vk = vks[i];
        const info = vks_info[i];
        const logger = createLogger(info.name);

        try {
            if (info.type === 'page') {
                await vk.api.status.set({
                    text: `${await TimeUntilNewYear()}`
                });
                logger(`Статус ${info.type} с ID ${info.idvk} изменен`);
            } else if (info.type === 'group') {
                /*
                await vk.api.status.set({
                    group_id: info.idvk,
                    status: `${await TimeUntilNewYear()}`
                });
                logger(`Статус группы с ID ${info.idvk} изменен`);
                */
            }
        } catch (error) {
            logger(`Ошибка при изменении статуса с ID ${info.idvk} и типом сущности ${info.type}: ${error}`);
        }
    }
}

async function TimeUntilNewYear() {
    const now = new Date();
    const newYear = new Date(now.getFullYear() + 1, 0, 1); // 1 января следующего года
    const diff = newYear.getTime() - now.getTime();

    const timeUnits = [
        { unit: "дн.", value: Math.floor(diff / 1000 / 60 / 60 / 24) },
        { unit: "ч.", value: Math.floor((diff / 1000 / 60 / 60) % 24) },
        { unit: "мин.", value: Math.floor((diff / 1000 / 60) % 60) }
    ];

    return `🎄 До НГ осталось: ${timeUnits
        .filter(({ value }) => value > 0)
        .map(({ unit, value }) => `${value} ${unit}`)
        .join(" ")}`;
}
