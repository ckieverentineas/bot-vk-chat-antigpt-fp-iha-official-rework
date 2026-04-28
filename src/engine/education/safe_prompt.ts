import { QuestionAnswer, QuestionMessageContext } from '../../module/question_flow';
import { renderTextImagePng } from '../../module/text_image';

type SendPhotoParams = NonNullable<Parameters<QuestionMessageContext['sendPhotos']>[1]>;

export interface EducationSafePrompt {
    readonly publicText: string;
    readonly imageText: string;
    readonly filename: string;
}

export function buildEducationQuestionPrompt(question: string): EducationSafePrompt {
    return {
        filename: 'education-question.png',
        imageText: [
            'Вопрос для обучения',
            '',
            question,
        ].join('\n'),
        publicText: [
            'Вопрос показан на изображении.',
            '',
            'Команды:',
            '!скорректировать - поправить вопрос;',
            '!добавить - добавить ответы;',
            '!пометить - считать неизвестный вопрос обработанным;',
            '!отмена - отменить обучение.',
        ].join('\n'),
    };
}

export function buildEducationCorrectionPrompt(currentQuestion: string, correctedQuestion: string): EducationSafePrompt {
    return {
        filename: 'education-question-correction.png',
        imageText: [
            'Корректировка вопроса',
            '',
            'Текущий вопрос:',
            currentQuestion,
            '',
            'Исправленный вопрос:',
            correctedQuestion,
        ].join('\n'),
        publicText: [
            'Текущий и исправленный вопросы показаны на изображении.',
            '',
            'Напишите !сохранить, если вас все устраивает.',
            'Иначе отправьте новый вариант вопроса.',
        ].join('\n'),
    };
}

export function buildEducationAnswerPrompt(question: string, answers: readonly string[]): EducationSafePrompt {
    const answerLines = answers.length
        ? answers.map((answer, index) => `${index + 1}. ${answer}`)
        : ['Ответы пока не добавлены.'];

    return {
        filename: 'education-question-answers.png',
        imageText: [
            'Добавление ответов',
            '',
            'Вопрос:',
            question,
            '',
            'Текущие ответы:',
            ...answerLines,
        ].join('\n'),
        publicText: [
            'Вопрос и добавленные ответы показаны на изображении.',
            '',
            'Напишите !сохранить, если вас все устраивает.',
            'Иначе отправьте новый вариант ответа.',
        ].join('\n'),
    };
}

export async function askEducationPrompt(
    context: QuestionMessageContext,
    prompt: EducationSafePrompt,
    params: SendPhotoParams = {},
): Promise<QuestionAnswer> {
    try {
        const image = await renderTextImagePng(prompt.imageText);

        await context.sendPhotos({
            value: image,
            filename: prompt.filename,
            contentType: 'image/png',
        }, {
            ...params,
            message: prompt.publicText,
        });
    } catch (error) {
        await context.send([
            prompt.publicText,
            '',
            `Не удалось приложить изображение вопроса: ${error}`,
        ].join('\n'), params);
    }

    return context.waitQuestion();
}
