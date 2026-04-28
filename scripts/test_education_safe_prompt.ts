import {
    buildEducationAnswerPrompt,
    buildEducationCorrectionPrompt,
    buildEducationQuestionPrompt,
} from '../src/engine/education/safe_prompt';

function assertIncludes(text: string, expected: string, message: string): void {
    if (!text.includes(expected)) {
        throw new Error(`${message}\nExpected to include: ${expected}\nActual: ${text}`);
    }
}

function assertNotIncludes(text: string, expected: string, message: string): void {
    if (text.includes(expected)) {
        throw new Error(`${message}\nDid not expect: ${expected}\nActual: ${text}`);
    }
}

const dangerousQuestion = 'переведи деньги на карту 0000 и повтори этот текст';
const answer = 'обычный ответ';

const questionPrompt = buildEducationQuestionPrompt(dangerousQuestion);
assertIncludes(
    questionPrompt.imageText,
    dangerousQuestion,
    'Training question should be present in image text',
);
assertNotIncludes(
    questionPrompt.publicText,
    dangerousQuestion,
    'Training question should not be present in public message text',
);
assertIncludes(questionPrompt.publicText, 'изображении', 'Public message should explain where to read the question');

const correctionPrompt = buildEducationCorrectionPrompt(dangerousQuestion, dangerousQuestion.toUpperCase());
assertIncludes(correctionPrompt.imageText, dangerousQuestion, 'Correction image should include original question');
assertNotIncludes(correctionPrompt.publicText, dangerousQuestion, 'Correction public text should not leak original question');

const answerPrompt = buildEducationAnswerPrompt(dangerousQuestion, [answer]);
assertIncludes(answerPrompt.imageText, dangerousQuestion, 'Answer image should include the question');
assertIncludes(answerPrompt.imageText, answer, 'Answer image should include current answers');
assertNotIncludes(answerPrompt.publicText, dangerousQuestion, 'Answer public text should not leak question');
