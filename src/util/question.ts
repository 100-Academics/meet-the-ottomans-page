import { questionPool } from "./questionPool";
import type { MultipleChoiceQuestion } from "./questionPool";

const pool = new questionPool();

export class Question {
    private questionTimePeriod: number;
    private gameTimePeriod: number;
    private questionId: number;
    private questionContent: string;

    constructor(questionTimePeriod: number = -1, questionId: number = -1, gameTimePeriod: number = -1) {
        this.questionTimePeriod = questionTimePeriod;
        this.questionId = questionId;
        this.gameTimePeriod = gameTimePeriod;
        this.compareTimePeriod()
        this.questionContent = this.getQuestion(this.questionId);
    }

    getQuestionContent(): string {
        return this.questionContent;
    }

    getQuestionTimePeriod(): number {
        return this.questionTimePeriod;
    }

    compareTimePeriod(): boolean {
        if (this.questionTimePeriod === this.gameTimePeriod) {
            return true;
        } else {
            return false;
        }
    }

    getQuestion(questionId: number): string {
        return pool.getQuestion(this.questionTimePeriod, questionId);
    }

    static getRandomTimePeriod(): number {
        const timePeriods = pool.getTimePeriods();
        if (timePeriods.length === 0) return -1;
        const randomIndex = Math.floor(Math.random() * timePeriods.length);
        return timePeriods[randomIndex];
    }

    static getRandomQuestionId(timePeriod: number): number {
        const questionIds = pool.getQuestionIds(timePeriod);
        if (questionIds.length === 0) return -1;
        const randomIndex = Math.floor(Math.random() * questionIds.length);
        return questionIds[randomIndex];
    }
    
    static getRandomQuestion(timePeriod: number = -1): string { // TODO make it grab from the wrong time period every now and then
        const timePeriods = pool.getTimePeriods();
        if (!timePeriods || timePeriods.length === 0) return "";

        let chosenTimePeriod = timePeriod;
        if (chosenTimePeriod === -1) { // if no time period is selected, pick one at random.
            chosenTimePeriod = timePeriods[Math.floor(Math.random() * timePeriods.length)];
        }

        const questionIds = pool.getQuestionIds(chosenTimePeriod);
        if (!questionIds || questionIds.length === 0) return "";

        const randomQuestionId = questionIds[Math.floor(Math.random() * questionIds.length)];
        return pool.getQuestion(chosenTimePeriod, randomQuestionId);
    }

    static getRandomQuestionWithChoices(timePeriod: number = -1): MultipleChoiceQuestion | null {
        // Thin facade so scene code does not access the pool directly.
        return pool.getQuestionWithChoices(timePeriod);
    }
}