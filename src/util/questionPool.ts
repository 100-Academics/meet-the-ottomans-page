export type QuestionEntry = {
    question: string;
    answer: string;
};

type IndexedQuestionEntry = {
    0: string;
    1: string;
};

type LegacyQuestionEntry =
    | string
    | QuestionEntry
    | IndexedQuestionEntry;

export type MultipleChoiceQuestion = {
    timePeriod: number;
    questionId: number;
    question: string;
    correctAnswer: string;
    choices: string[];
};

export class questionPool{

    // map: timePeriod -> (questionId -> questionText)
    // time periods are:
    // 0: N/A
    // 1: 1200-1300
    // 2: 1400-1500
    // 3: 1500-1700
    // 4: 1700-1900
    // 5: 1900-1945
    // 6: 1945-2000
    // 7: 2000-2026
    // 8: ∞
    private questions: Record<number, Record<number, LegacyQuestionEntry>> = {
        0: {
            // N/A
            0: { question: "How are you here?", answer: "Begone" }, // questions should be formatted like this
            1: { question: "You shouldn't see this", answer: "My bad man" },
            2: { question: "Your end is nigh.", answer: "GET OUT" }
        },
        
        // 1: 1200-1300
        1: {
        0: { question: "Genghis Khan begins his conquest of Asia", answer: "1206 CE" },
        1: { question: "Magna Carta signed by King John at Runnymede", answer: "1215 CE" },
        2: { question: "Pax Mongolica (includes Marco Polo's travels and fall of the Song Dynasty)", answer: "1250-1350 CE" },
        3: { question: "Rise of Ottomans", answer: "1300s CE" },
        4: { question: "Mansa Musa's pilgrimage", answer: "1324 CE" },
    },

        // 2: 1400-1500
        2: {
        0: { question: "Travels of Ibn Battuta", answer: "1325-1349 CE" },
        1: { question: "Hundred Year's War", answer: "1337-1453" },
        2: { question: "Renaissance begins", answer: "1340" },
        3: { question: "Bubonic Plague in Europe", answer: "1347-1348 CE" },
        4: { question: "Zheng He's voyages", answer: "1405-1433 CE" },
        5: { question: "Rise of the Inca", answer: "1438 CE" },
        6: { question: "Ottomans capture Constantinople", answer: "1453 CE" },
        7: { question: "Aztec Empire at its height", answer: "1486 CE" },
        8: { question: "Dias rounded Cape of Good Hope", answer: "1488 CE" },
        9: { question: "Columbus sailed to Hispaniola/Reconquista of Spain", answer: "1492 CE" },
        },

        // 3: 1500-1700
        3: {
        0: { question: "The Great Dying", answer: "1500-1750 CE" },
        1: { question: "Portuguese arrive in Brazil / first African slaves transported to Caribbean / Reign of King Afonso in Kongo", answer: "1502 CE / 1506-1542" },
        2: { question: "Martin Luther/95 theses - Protestant Reformation", answer: "1517 CE" },
        3: { question: "Cortez conquered the Aztecs / Beginning of Mughal expansion", answer: "1521 CE" },
        4: { question: "Pizarro toppled the Inca / French arrive in Canada", answer: "1533 CE" },
        5: { question: "Discovery of silver at Potosí", answer: "1545 CE" },
        6: { question: "Battle of Lepanto - naval defeat of Ottomans; Manila Galleons sail / creation of 1st Global Silver Market", answer: "1571 CE" },
        7: { question: "Defeat of the Spanish Armada", answer: "1588 CE" },
        8: { question: "Scientific Revolution", answer: "16th - 17th C CE" },
        9: { question: "Battle of Sekigahara - beginning of Tokugawa Shogunate / Fall of Songhai", answer: "1600 CE" },
        10: { question: "Founding of Jamestown / Dutch arrive in America", answer: "1607 CE" },
        11: { question: "Thirty Years War in Europe", answer: "1618-1648 CE" },
        12 : { question: "End of Ming Dynasty - rise of the Qing", answer: "1644 CE" },
        13: { question: "Establishment of Cape Town Colony", answer: "1652 CE" },
        14: { question: "Local resistance to state expansion - Ana Nzinga's resistance / Cossack revolts / Metacom's War (King Philip's War) / Pueblo Revolts / Maratha conflict with Mughals", answer: "17th C" },
        15: { question: "Beginning of the rule of Peter the Great in Russia (Russian Expansion) / unsuccessful Ottoman siege of Vienna", answer: "1682 CE" },
        16: { question: "Glorious Revolution/English Bill of Rights", answer: "1688/1689 CE" },
        },

        // 4: 1700-1900
        4: {
        0: { question: "Enlightenment", answer: "1650 to +/-1800" },
        1: { question: "\"First\" Industrial Revolution begins", answer: "1750-1850 CE" },
        2: { question: "7 years war/French & Indian War / Publication of Jean-Jacques Rousseau's The Social Contract", answer: "1756-1763 CE" },
        3: { question: "Captain Cook charts coast of New Zealand and Australia (UK colonization follows)", answer: "1770" },
        4: { question: "American Declaration of Independence / American Revolution / Adam Smith writes Wealth of Nations / Tupac Amaru II Rebellion in Peru", answer: "1775/1776/1780 CE" },
        5: { question: "French Revolution - Declaration of the Rights of Man and Citizen / Declaration of the Rights of Women / Mary Wollstonecraft's A Vindication of the Rights of Woman", answer: "1789 CE" },
        6: { question: "Haitian independence / Muhammad Ali begins rule of Egypt", answer: "1804 CE" },
        7: { question: "British Abolition of the slave trade", answer: "1807 CE" },
        8: { question: "Latin American battles for independence (first Mexican Revolution) / Bolivar's Jamaica Letter", answer: "1810-1825 CE" },
        9: { question: "Metternich hosts Congress of Vienna (Napoleonic Empire ends)", answer: "1815 CE" },
        10: { question: "Greek Independence from the Ottomans / French colonize Algeria / 1st Opium War between China and UK", answer: "1832/1839" },
        11: { question: "Maoris fight New Zealand Wars / European revolutions / Marx & Engels wrote Communist Manifesto / Seneca Falls Conference", answer: "1845/1848 CE" },
        12: { question: "Taiping Rebellion / Commodore Perry 'opens' Japan / Crimean War", answer: "1850-1864 CE" },
        13: { question: "Xhosa Cattle Killing Movement in Southern Africa / Sepoy Mutiny in India", answer: "1856 CE" },
        14: { question: "End of Russian serfdom & beginning of its industrialization / Italian unification / Beginning of Chinese Self-Strengthening Movement / US Emancipation Proclamation", answer: "1861 CE" },
        15: { question: "Meiji Restoration / Fall of Tokugawa - Japanese begin industrializing", answer: "1868 CE" },
        16: { question: "\"Second\" Industrial Revolution / German Unification", answer: "1870-1914" },
        17: { question: "Mahdist Wars in Sudan / Berlin Conference (Scramble for Africa starts) & Benz develops first car / Ghost Dance in US", answer: "1881/1885 CE" },
        18: { question: "New Zealand is 1st to award women suffrage / Samory Touré's military battles in West Africa", answer: "1893 CE" },
        19: { question: "Battle of Adwa (Ethiopians vs. Italians) / Spanish-American War - Spain loses colonies to US / Boer War - Dutch under British rule in South Africa", answer: "1896/1898 CE" },
        },

        // 5: 1900-1945
        5: {
        0: { question: "Boxer Rebellion in China / Yaa Asantewaa War in West Africa", answer: "1900 CE" },
        1: { question: "Russo-Japanese war / Einstein's theory of special relativity published", answer: "1905 CE" },
        2: { question: "Mexican Revolution / Chinese Revolution (1st) / Fall of Qing", answer: "1910-1920 CE" },
        3: { question: "WWI / Treaty of Versailles / Armenian Genocide / Russian Revolution / Influenza Pandemic / Fall of Ottoman Empire and Amritsar Massacre", answer: "1914-1919 CE" },
        4: { question: "Stock Market Crash/Great Depression", answer: "1929 CE" },
        5: { question: "Japanese invasion of Manchuria / Italian invasion of Ethiopia / German blitzkrieg in Poland / Pearl Harbor / Battle of Stalingrad", answer: "1931 CE" },
        6: { question: "Holocaust - end of WWII - and dropping of atomic bombs on Japan", answer: "1945 CE" },
        }, 

        // 6: 1945-2000
        6: {
        0: { question: "Freedom & partition of India / Beginning of Cold War / Birth of Israel / U.N. Universal Declaration of Human Rights", answer: "1947 CE" },
        1: { question: "Chinese Communist Revolution", answer: "1949 CE" },
        2: { question: "Green Revolution", answer: "1950-1970" },
        3: { question: "Korean War / Vietnamese defeat French at Dien Bien Phu (US get involved)", answer: "1950-1954 CE" },
        4: { question: "First polio vaccine used", answer: "1955" },
        5: { question: "Nationalization of Suez Canal / Ghana gained independence", answer: "1956 CE" },
        6: { question: "Great Leap Forward in China / Cuban Revolution / Invention of silicon chip", answer: "1958-1961 CE" },
        7: { question: "6 Day War (in Israel) / Chinese Cultural Revolution", answer: "1967 CE" },
        8: { question: "Protests in Chicago, Mexico, Czechoslovakia, France, etc. / Biafra war / Quebecois Movement in Canada", answer: "1968" },
        9: { question: "Yom Kippur War", answer: "1973 CE" },
        10: { question: "Angola Civil War Begins / Cambodian Genocide begins / 1976 - Soweto Uprising / 1978 - Sandinista vs. Contras conflict in Nicaragua erupts", answer: "1975" },
        11: { question: "Iranian Revolution", answer: "1979 CE" },
        12: { question: "First artificial heart used", answer: "1982" },
        13: { question: "1st Palestinian Intifada", answer: "1987 CE" },
        14: { question: "Tiananmen Square in China / Fall of Berlin Wall", answer: "1989 CE" },
        15: { question: "Namibia is the last country to gain independence in Africa", answer: "1990 CE" },
        16: { question: "End of USSR / End of Cold War​​​​​​​​​​​​​​​​", answer: "1991 CE" },
        },

        // 7: 2000-2026
        7: {
        0: { question: " 9/11 attacks / War in Afghanistan", answer: "2001 CE" },
        1: { question: " Twitter is launched / Great Global Recession begins", answer: "2006 CE" },
        2: { question: " Wikileaks / Arab Spring (Tunisian, Egyptian, Libyan, Yemeni, Syrian, Bahraini etc. democracy movements) / Syrian Civil War begins / Independence of South Sudan", answer: "2011 CE" },
        3: { question: " Ebola virus kills over 11,000 / ISIS begins attacks", answer: "2014" },
        4: { question: " COVID-19 / January 6th Attacks", answer: "2020" },
        },


        8: { // ∞
        0: { question: "What concept describes the theoretical endpoint where artificial intelligence surpasses human intelligence across all domains?", answer: "The technological singularity" },
        1: { question: "What paradox asks whether a simulated reality can be distinguished from base reality, and what are its implications for civilization?", answer: "The simulation hypothesis" },
        2: { question: "What interstellar propulsion concept, requiring breakthroughs in physics, could enable travel between stars?", answer: "Warp drive / antimatter propulsion / fusion rockets" },
        3: { question: "What Kardashev scale measures a civilization's advancement by its energy consumption?", answer: "The Kardashev scale (Type I, II, III)" },
        4: { question: "What existential risks threaten the long-term survival of human civilization?", answer: "Nuclear war, engineered pandemics, unaligned AI, climate collapse, asteroid impact" }
        }

    };

    constructor(initial?: Record<number, Record<number, LegacyQuestionEntry>>){
        if (initial) this.questions = initial;
        // Keep backward compatibility with legacy string-only question maps.
        this.normalizeQuestions();
    }

    private normalizeQuestions(): void {
        for (const [timePeriodStr, period] of Object.entries(this.questions)) {
            const timePeriod = Number(timePeriodStr);
            for (const [questionIdStr, questionOrEntry] of Object.entries(period)) {
                const questionId = Number(questionIdStr);
                if (typeof questionOrEntry === "string") {
                    // Promote legacy string entries into indexed records: 0=question, 1=answer.
                    period[questionId] = {
                        0: questionOrEntry,
                        1: this.buildDefaultAnswer(timePeriod, questionId, questionOrEntry)
                    };
                    continue;
                }

                if ("question" in questionOrEntry && "answer" in questionOrEntry) {
                    // Migrate object records into indexed records.
                    period[questionId] = {
                        0: questionOrEntry.question,
                        1: questionOrEntry.answer
                    };
                }
            }
        }
    }

    private buildDefaultAnswer(timePeriod: number, questionId: number, questionText: string): string {
        return `A historically grounded explanation for period ${timePeriod}, question ${questionId}: ${questionText}`;
    }

    private getQuestionEntry(timePeriod: number, questionId: number): QuestionEntry | null {
        const period = this.questions[timePeriod];
        if (!period) return null;

        const entry = period[questionId];
        if (!entry) return null;

        if (typeof entry === "string") {
            const normalizedEntry: IndexedQuestionEntry = {
                0: entry,
                1: this.buildDefaultAnswer(timePeriod, questionId, entry)
            };
            period[questionId] = normalizedEntry;
            return { question: normalizedEntry[0], answer: normalizedEntry[1] };
        }

        if ("question" in entry && "answer" in entry) {
            return { question: entry.question, answer: entry.answer };
        }

        return { question: entry[0], answer: entry[1] };
    }

    private shuffle<T>(items: T[]): T[] {
        const arr = [...items];
        // Fisher-Yates shuffle for unbiased randomized answer order.
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    public getTimePeriods(): number[] {
        return Object.keys(this.questions).map(Number);
    }

    public getQuestion(timePeriod: number, questionId: number): string {
        const entry = this.getQuestionEntry(timePeriod, questionId);
        return entry?.question ?? "";
    }

    public getAnswer(timePeriod: number, questionId: number): string {
        const entry = this.getQuestionEntry(timePeriod, questionId);
        return entry?.answer ?? "";
    }

    public getQuestionIds(timePeriod: number): number[] {
        const period = this.questions[timePeriod];
        if (!period) return [];
        return Object.keys(period).map(Number);
    }

    public setQuestion(timePeriod: number, questionId: number, text: string): void {
        if (!this.questions[timePeriod]) this.questions[timePeriod] = {};
        this.questions[timePeriod][questionId] = {
            0: text,
            1: this.buildDefaultAnswer(timePeriod, questionId, text)
        };
    }

    public setQuestionWithAnswer(timePeriod: number, questionId: number, question: string, answer: string): void {
        if (!this.questions[timePeriod]) this.questions[timePeriod] = {};
        this.questions[timePeriod][questionId] = { 0: question, 1: answer };
    }

    public getQuestionWithChoices(timePeriod: number = -1): MultipleChoiceQuestion | null {
        const timePeriods = this.getTimePeriods();
        if (timePeriods.length === 0) return null;

        const chosenTimePeriod = timePeriod === -1
            ? timePeriods[Math.floor(Math.random() * timePeriods.length)]
            : timePeriod;

        const questionIds = this.getQuestionIds(chosenTimePeriod);
        if (questionIds.length === 0) return null;

        const questionId = questionIds[Math.floor(Math.random() * questionIds.length)];
        const entry = this.getQuestionEntry(chosenTimePeriod, questionId);
        if (!entry) return null;

        // Build distractors from the same time period as the selected question.
        const distractorPool: string[] = [];
        for (const candidateId of this.getQuestionIds(chosenTimePeriod)) {
            if (candidateId === questionId) continue;
            const candidateEntry = this.getQuestionEntry(chosenTimePeriod, candidateId);
            if (candidateEntry) {
                distractorPool.push(candidateEntry.answer);
            }
        }

        const distractors = this.shuffle(distractorPool).slice(0, 3);
        const choices = this.shuffle([entry.answer, ...distractors]);

        return {
            timePeriod: chosenTimePeriod,
            questionId,
            question: entry.question,
            correctAnswer: entry.answer,
            choices
        };
    }

    public deleteQuestion(timePeriod: number, questionId: number): boolean {
        const period = this.questions[timePeriod];
        if (!period || !(questionId in period)) return false;
        delete period[questionId];
        if (Object.keys(period).length === 0) delete this.questions[timePeriod];
        return true;
    }
}
