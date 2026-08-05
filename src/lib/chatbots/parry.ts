interface Emotions {
	anger: number;
	fear: number;
	mistrust: number;
	hurt: number;
}

interface EmotionJumps {
	ajump: number;
	fjump: number;
	hjump: number;
}

type BeliefCategory = "HUM" | "HUM2" | "DOC" | "INT" | "INN";

interface Belief {
	name: string;
	strength: number;
	category: BeliefCategory;
	negated: boolean;
}

interface Inference {
	type: "TH2" | "EMOTE" | "IF";
	condition: string[];
	consequences: string[];
}

interface Pattern {
	tokens: string[];
	response: number;
}

const SYNONYMS: [string, string][] = [
	["ABLE", "ABLE"],
	["ABOUT", "IN"],
	["ABOVE", "IN"],
	["ABSURD", "BAD"],
	["ACCEPT", "AGREE"],
	["ACCIDENT", "PAINS"],
	["ACHE", "PAINS"],
	["ACID", "DRUGS"],
	["ACT", "SEEM"],
	["ACTION", "ACTS"],
	["ACTIVE", "HOBBY"],
	["ADDICT", "DOPER"],
	["ADDICTION", "DRUGS"],
	["ADMIRE", "LIKE"],
	["AFRAID", "SCARE"],
	["AFTER", "IN"],
	["AGE", "AGE"],
	["AGGRAVATE", "ANGRY"],
	["AGREE", "AGREE"],
	["AID", "HELP"],
	["ALCOHOL", "BEER"],
	["ALIVE", "LIFE"],
	["ALONE", "ALONE"],
	["ALREADY", "BEFOR"],
	["ALSO", "A"],
	["ALTHOUGH", "AND"],
	["ALWAYS", "OFTEN"],
	["AMBITION", "PLANS"],
	["ANGER", "ANGRY"],
	["ANGRY", "ANGRY"],
	["ANIMAL", "FOBIA"],
	["ANNOY", "ANGRY"],
	["ANOTHER", "OTHER"],
	["ANSWER", "REPLY"],
	["ANXIETY", "FEAR"],
	["ANXIOUS", "SCARE"],
	["ANYBODY", "PEOPL"],
	["ANYONE", "PEOPL"],
	["ANYTHING", "IT"],
	["AWAY", "LEAVE"],
	["BAD", "BAD"],
	["BEAT", "HARM"],
	["BEAUTIFUL", "GOOD"],
	["BECAUSE", "AND"],
	["BED", "SLEEP"],
	["BEER", "BEER"],
	["BET", "BET"],
	["BIG", "ODD"],
	["BILL", "MONEY"],
	["BIRTH", "BORN"],
	["BITE", "EAT"],
	["BLACK", "COLOR"],
	["BLAME", "BLAME"],
	["BLOOD", "KILL"],
	["BLUE", "SAD"],
	["BODY", "BODY"],
	["BOMB", "GUN"],
	["BOOK", "READ"],
	["BOOKIE", "CROOK"],
	["BORING", "BORE"],
	["BORN", "BORN"],
	["BOSS", "CHIEF"],
	["BOTHER", "UPSET"],
	["BRAIN", "BRAIN"],
	["BREAK", "KILL"],
	["BRIB", "FUZZ"],
	["BRIGHT", "SMART"],
	["BROTHER", "SISTE"],
	["BUCK", "MONEY"],
	["BUG", "BUG"],
	["BUILD", "WEIGH"],
	["BULLET", "GUN"],
	["BUSINESS", "WORK"],
	["BUY", "LOSE"],
	["CALL", "CALL"],
	["CALM", "CALM"],
	["CAME", "COME"],
	["CAR", "CAR"],
	["CARE", "LIKE"],
	["CASH", "MONEY"],
	["CATCH", "FRAME"],
	["CAUSE", "CAUSE"],
	["CHEAT", "CHEAT"],
	["CHECK", "CHECK"],
	["CHESS", "GAME"],
	["CHIEF", "CHIEF"],
	["CHILD", "CHILD"],
	["CITY", "CITY"],
	["CLEVER", "SMART"],
	["CLOSE", "FRIEN"],
	["COME", "COME"],
	["COMFORT", "COMFO"],
	["COMPUTER", "COMPU"],
	["CON", "CRIME"],
	["CONCERN", "SCARE"],
	["CONFUSE", "PUZZL"],
	["CONSCIOUS", "SHY"],
	["CONSIDER", "THINK"],
	["CONSPIRACY", "SPY"],
	["CONTINUE", "TELL"],
	["CONTROL", "FORCE"],
	["COOL", "GOOD"],
	["COP", "FUZZ"],
	["CORRECT", "RIGHT"],
	["COST", "LOSE"],
	["COULD", "COULD"],
	["COUNT", "ADD"],
	["COUNTRY", "POLIT"],
	["COWARD", "BAD"],
	["CRAP", "SHIT"],
	["CRAZY", "CRAZY"],
	["CRIME", "CRIME"],
	["CROOK", "CROOK"],
	["CRY", "SAD"],
	["CURE", "BEST"],
	["DAD", "DAD"],
	["DANCE", "HOBBY"],
	["DANGER", "SCARE"],
	["DATE", "DATE"],
	["DAY", "DAY"],
	["DEAD", "DEATH"],
	["DEAL", "TREAT"],
	["DEATH", "DEATH"],
	["DECIDE", "WANT"],
	["DEFENSIVE", "ANGRY"],
	["DEJECTED", "SAD"],
	["DELUSION", "CRAZY"],
	["DEPEND", "A"],
	["DEPRESS", "SAD"],
	["DESCRIBE", "TELL"],
	["DESIRE", "WANT"],
	["DESPAIR", "SAD"],
	["DESTROY", "KILL"],
	["DETECTIVE", "FUZZ"],
	["DIE", "DEATH"],
	["DIET", "EAT"],
	["DIFFERENT", "CHANG"],
	["DIG", "LIKE"],
	["DIME", "MONEY"],
	["DINNER", "EAT"],
	["DISAGREE", "ARGUE"],
	["DISLIKE", "HATE"],
	["DO", "DO"],
	["DOCTOR", "DR"],
	["DOLLAR", "MONEY"],
	["DOPE", "DRUGS"],
	["DOUBT", "DOUBT"],
	["DREAM", "DREAM"],
	["DRINK", "DRINK"],
	["DRIVE", "CAR"],
	["DRUG", "DRUGS"],
	["DRUNK", "DRINK"],
	["DUMB", "BAD"],
	["DYING", "DEATH"],
	["EAT", "EAT"],
	["EDUCATED", "SMART"],
	["ELSE", "OTHER"],
	["EMOTION", "UPSET"],
	["ENEMY", "SPY"],
	["ENJOY", "LIKE"],
	["ENOUGH", "A"],
	["EVERYONE", "PEOPL"],
	["EVIDENCE", "PROOF"],
	["EVIL", "BAD"],
	["EXACTLY", "SPECI"],
	["FACT", "STORY"],
	["FAIL", "GUILT"],
	["FAIR", "FAIR"],
	["FAKE", "FAKE"],
	["FAMILY", "FAMLY"],
	["FAR", "A"],
	["FASCINATE", "INTER"],
	["FAST", "A"],
	["FAT", "BAD"],
	["FATHER", "DAD"],
	["FEAR", "FEAR"],
	["FEEL", "FEEL"],
	["FEW", "A"],
	["FIGHT", "ARGUE"],
	["FIND", "FIND"],
	["FINE", "GOOD"],
	["FIRE", "FOBIA"],
	["FISH", "HOBBY"],
	["FOCUS", "ATTEN"],
	["FOOD", "EAT"],
	["FOOL", "BAD"],
	["FORCE", "FORCE"],
	["FORGET", "MEMOR"],
	["FREE", "FREE"],
	["FRIEND", "FRIEN"],
	["FRO", "IN"],
	["FROM", "IN"],
	["FUCK", "SCREW"],
	["FUN", "HOBBY"],
	["FUNNY", "ODD"],
	["GAIN", "LOSE"],
	["GAMBLE", "BET"],
	["GAME", "GAME"],
	["GANGSTER", "HOOD"],
	["GATHER", "THINK"],
	["GAY", "FAG"],
	["GET", "GET"],
	["GIRL", "GIRL"],
	["GIVE", "GIVE"],
	["GLAD", "HAPPY"],
	["GO", "GO"],
	["GOAL", "PLANS"],
	["GOD", "GOD"],
	["GOOD", "GOOD"],
	["GOVERNOR", "GOVER"],
	["GREAT", "GOOD"],
	["GUILT", "GUILT"],
	["GUN", "GUN"],
	["HABITS", "ACTS"],
	["HAPPEN", "HAPPE"],
	["HAPPY", "HAPPY"],
	["HARM", "HARM"],
	["HATE", "HATE"],
	["HEAD", "BRAIN"],
	["HEALTH", "PAINS"],
	["HEAR", "HEAR"],
	["HEART", "BODY"],
	["HEAVEN", "PRAY"],
	["HELP", "HELP"],
	["HERE", "THERE"],
	["HEROIN", "DRUGS"],
	["HIGH", "TALL"],
	["HIM", "THEY"],
	["HIRE", "JOB"],
	["HIT", "HARM"],
	["HOBBY", "HOBBY"],
	["HOLD", "HOLD"],
	["HOME", "HOME"],
	["HONEST", "FAIR"],
	["HOPE", "WANT"],
	["HOPELESS", "SAD"],
	["HORNY", "HORNY"],
	["HORSE", "HORSE"],
	["HOSPITAL", "HOSPI"],
	["HOSTILE", "ANGRY"],
	["HOW", "HOW"],
	["HUMAN", "HUMAN"],
	["HURT", "HARM"],
	["HUSBAND", "HUBBY"],
	["I", "I"],
	["IDEA", "IDEA"],
	["IDEAS", "IDEAS"],
	["IDIOT", "BAD"],
	["ILL", "PAINS"],
	["IMAGINE", "THINK"],
	["IMPORTANT", "POINT"],
	["IN", "IN"],
	["INSANE", "CRAZY"],
	["INSECURE", "SAD"],
	["INSIDE", "IN"],
	["INSULT", "BLAME"],
	["INTELLIGENT", "SMART"],
	["INTEND", "WANT"],
	["INTEREST", "INTER"],
	["INTO", "IN"],
	["IRRITATE", "ANGRY"],
	["ISOLATED", "ALONE"],
	["ISSUE", "POINT"],
	["IT", "IT"],
	["ITALIAN", "ITALY"],
	["ITALY", "ITALY"],
	["JAIL", "FUZZ"],
	["JEALOUS", "FUSSY"],
	["JERK", "BAD"],
	["JEW", "JEW"],
	["JOB", "JOB"],
	["JOKE", "LIAR"],
	["JOY", "HAPPY"],
	["JUST", "A"],
	["KEEP", "HOLD"],
	["KICK", "HARM"],
	["KILL", "KILL"],
	["KILLER", "KILLE"],
	["KIND", "TYPE"],
	["KISS", "SCREW"],
	["KNIFE", "GUN"],
	["KNOW", "KNOW"],
	["LAUGH", "LAUGH"],
	["LAW", "FUZZ"],
	["LAWYER", "FUZZ"],
	["LEAD", "CAUSE"],
	["LEARN", "LEARN"],
	["LEAST", "A"],
	["LEAVE", "LEAVE"],
	["LEFT", "LEAVE"],
	["LESS", "A"],
	["LET", "LET"],
	["LIAR", "LIAR"],
	["LIE", "LIAR"],
	["LIFE", "LIFE"],
	["LIKE", "LIKE"],
	["LINE", "A"],
	["LIVE", "LIFE"],
	["LONELY", "ALONE"],
	["LOOK", "LOOK"],
	["LOOKS", "LOOKS"],
	["LOSE", "LOST"],
	["LOST", "LOST"],
	["LOVE", "LIKE"],
	["LOW", "SAD"],
	["MAD", "ANGRY"],
	["MAFIA", "MAFIA"],
	["MAKE", "MAKE"],
	["MALE", "MALE"],
	["MAN", "MALE"],
	["MATTER", "UPSET"],
	["ME", "ME"],
	["MEAN", "MEAN"],
	["MEANING", "CAUSE"],
	["MEDICAL", "PAINS"],
	["MEDICINE", "PILLS"],
	["MEN", "MALE"],
	["MENTAL", "SANE"],
	["MENTION", "TELL"],
	["MEMORY", "MEMOR"],
	["MIND", "BRAIN"],
	["MINE", "I"],
	["MONEY", "MONEY"],
	["MOOD", "SAD"],
	["MORE", "A"],
	["MOTHER", "MOM"],
	["MOVE", "A"],
	["MOVIE", "MOVIE"],
	["MUSIC", "MUSIC"],
	["MUST", "COULD"],
	["MY", "I"],
	["MYSELF", "SELF"],
	["NAME", "NAME"],
	["NASTY", "NASTY"],
	["NEED", "NEED"],
	["NERVE", "NERVE"],
	["NERVOUS", "NERVE"],
	["NEVER", "NOT"],
	["NEWS", "NEWS"],
	["NIGHT", "NIGHT"],
	["NICE", "GOOD"],
	["NO", "NOT"],
	["NOBODY", "PEOPL"],
	["NORMAL", "REAL"],
	["NOT", "NOT"],
	["NOW", "EVER"],
	["NUMBER", "NUMBR"],
	["ODD", "ODD"],
	["OF", "IN"],
	["OFF", "IN"],
	["OFTEN", "OFTEN"],
	["OLD", "OLD"],
	["ON", "IN"],
	["ONE", "PEOPL"],
	["ONLY", "A"],
	["OPEN", "A"],
	["OR", "AND"],
	["OTHER", "OTHER"],
	["OUR", "WE"],
	["OUT", "LEAVE"],
	["OVER", "IN"],
	["PAIN", "PAINS"],
	["PAL", "FRIEN"],
	["PARENT", "FAMLY"],
	["PART", "A"],
	["PARTY", "PARTY"],
	["PASS", "LEAVE"],
	["PATIENT", "PATIE"],
	["PAY", "PAY"],
	["PEOPLE", "PEOPL"],
	["PERHAPS", "A"],
	["PERSON", "HUMAN"],
	["PHONE", "TV"],
	["PICK", "PICK"],
	["PILLS", "PILLS"],
	["PLACE", "PLACE"],
	["PLAN", "WANT"],
	["PLAY", "LIKE"],
	["PLEASE", "A"],
	["PLENTY", "A"],
	["PLUS", "PLUS"],
	["POINT", "POINT"],
	["POLICE", "FUZZ"],
	["POLITICS", "POLIT"],
	["POOR", "BAD"],
	["POSITION", "WORK"],
	["POSSIBLE", "POSSI"],
	["POVERTY", "MONEY"],
	["POWERFUL", "FORCE"],
	["PRAY", "PRAY"],
	["PRESIDENT", "PRES"],
	["PRETTY", "A"],
	["PRICE", "HWMCH"],
	["PRISON", "FUZZ"],
	["PROBLEM", "UPSET"],
	["PROOF", "PROOF"],
	["PROVE", "PROOF"],
	["PSYCHIATRIST", "DR"],
	["PSYCHOTIC", "CRAZY"],
	["PULL", "A"],
	["PURPOSE", "CAUSE"],
	["PUT", "BRING"],
	["QUESTION", "ASK"],
	["QUIT", "STOP"],
	["RACE", "COLOR"],
	["RACKET", "CRIME"],
	["RAGE", "ANGRY"],
	["RAISE", "BORN"],
	["RATHER", "LIKE"],
	["REAL", "REAL"],
	["REALIZE", "KNOW"],
	["REASON", "CAUSE"],
	["RECALL", "MEMOR"],
	["REDUCE", "ADD"],
	["REMEMBER", "MEMOR"],
	["REPLY", "REPLY"],
	["REPUBLICAN", "POLIT"],
	["REST", "A"],
	["RICH", "MONEY"],
	["RIGHT", "RIGHT"],
	["RINGS", "CRIME"],
	["ROB", "CHEAT"],
	["ROCK", "MUSIC"],
	["ROOM", "WARD"],
	["RUN", "FORCE"],
	["SAD", "SAD"],
	["SAFE", "CALM"],
	["SAME", "REAL"],
	["SANE", "SANE"],
	["SATISFY", "HAPPY"],
	["SAY", "SAY"],
	["SCARE", "SCARE"],
	["SCHOOL", "SCHOO"],
	["SCREW", "SCREW"],
	["SECRET", "SECRE"],
	["SEE", "SEE"],
	["SEEK", "WANT"],
	["SEEM", "SEEM"],
	["SELF", "SELF"],
	["SEND", "BRING"],
	["SENSE", "SENSE"],
	["SERIOUS", "RIGHT"],
	["SERVICE", "ARMY"],
	["SEX", "SEX"],
	["SHY", "SHY"],
	["SICK", "CRAZY"],
	["SIDE", "A"],
	["SIGNAL", "A"],
	["SISTER", "SISTE"],
	["SLEEP", "SLEEP"],
	["SMART", "SMART"],
	["SMELL", "TASTE"],
	["SMOKE", "SMOKE"],
	["SO", "A"],
	["SOCIETY", "PEOPL"],
	["SOLDIER", "HOOD"],
	["SOME", "A"],
	["SOMEBODY", "PEOPL"],
	["SOMEONE", "PEOPL"],
	["SOMETHING", "IT"],
	["SON", "CHILD"],
	["SORRY", "SORRY"],
	["SORT", "TYPE"],
	["SOUND", "SEEM"],
	["SPY", "SPY"],
	["START", "START"],
	["STATE", "STATE"],
	["STAY", "STAY"],
	["STEAL", "CHEAT"],
	["STILL", "A"],
	["STOP", "STOP"],
	["STORY", "STORY"],
	["STRICT", "STRIC"],
	["STRONG", "GOOD"],
	["STUPID", "BAD"],
	["SUCCEED", "ABLE"],
	["SUFFER", "PAINS"],
	["SURE", "RIGHT"],
	["SUSPECT", "DOUBT"],
	["TAKE", "TAKE"],
	["TALK", "TELL"],
	["TALL", "TALL"],
	["TELL", "TELL"],
	["TEMPER", "TEMPE"],
	["TEN", "NUMBR"],
	["TEND", "A"],
	["TEST", "SCHOO"],
	["THAN", "AND"],
	["THAT", "THAT"],
	["THE", "A"],
	["THEIR", "THEY"],
	["THEM", "THEY"],
	["THEN", "AND"],
	["THERE", "THERE"],
	["THESE", "IT"],
	["THEY", "THEY"],
	["THING", "IT"],
	["THINK", "THINK"],
	["THIS", "IT"],
	["THOSE", "IT"],
	["THOUGH", "AND"],
	["THREAT", "SCARE"],
	["THROUGH", "IN"],
	["TIME", "DAY"],
	["TIRED", "BORE"],
	["TO", "IN"],
	["TODAY", "TODAY"],
	["TONIGHT", "TODAY"],
	["TOO", "A"],
	["TOP", "A"],
	["TOPIC", "TOPIC"],
	["TOUGH", "TOUGH"],
	["TOWARD", "IN"],
	["TOWN", "CITY"],
	["TRAP", "FRAME"],
	["TREAT", "TREAT"],
	["TREATMENT", "PILLS"],
	["TRIAL", "FUZZ"],
	["TRICK", "CHEAT"],
	["TRUE", "RIGHT"],
	["TRUST", "TRUST"],
	["TRY", "WANT"],
	["TURN", "A"],
	["UGLY", "BAD"],
	["UNCERTAIN", "WRONG"],
	["UNDERSTAND", "UNDRS"],
	["UNHAPPY", "SAD"],
	["UNUSUAL", "ODD"],
	["UP", "IN"],
	["UPSET", "UPSET"],
	["US", "WE"],
	["USE", "TAKE"],
	["USED", "TAKE"],
	["USUAL", "REAL"],
	["VERY", "A"],
	["VIOLENT", "KILL"],
	["VISIT", "VISIT"],
	["WAIT", "STAY"],
	["WALK", "A"],
	["WANT", "WANT"],
	["WAR", "ARMY"],
	["WARD", "WARD"],
	["WARY", "SCARE"],
	["WATCH", "WATCH"],
	["WATER", "FOBIA"],
	["WAY", "WAY"],
	["WE", "WE"],
	["WEAPON", "GUN"],
	["WEAR", "LOOKS"],
	["WEATHER", "WEATH"],
	["WEEK", "DAY"],
	["WEIRD", "BAD"],
	["WELL", "WELL"],
	["WHAT", "WHAT"],
	["WHEN", "WHEN"],
	["WHERE", "WHERE"],
	["WHICH", "WHAT"],
	["WHILE", "WHEN"],
	["WHO", "WHO"],
	["WHY", "WHY"],
	["WIFE", "WIFE"],
	["WILL", "COULD"],
	["WILLING", "WANT"],
	["WIN", "LOSE"],
	["WISE", "SMART"],
	["WISH", "WANT"],
	["WITH", "IN"],
	["WITHOUT", "IN"],
	["WOMAN", "GIRL"],
	["WON", "LOST"],
	["WONDER", "THINK"],
	["WORK", "WORK"],
	["WORLD", "PEOPL"],
	["WORRY", "FEAR"],
	["WORSE", "SAD"],
	["WORST", "BAD"],
	["WORTH", "GOOD"],
	["WOULD", "COULD"],
	["WRONG", "WRONG"],
	["YEAR", "DAY"],
	["YEAH", "RIGHT"],
	["YES", "RIGHT"],
	["YET", "AND"],
	["YOU", "YOU"],
	["YOUR", "YOU"],
	["YOURSELF", "YOU"],
];

const SIMPLE_PATTERNS: Pattern[] = [
	{ tokens: ["GO", "ON"], response: 16 },
	{ tokens: ["CONTINUE"], response: 16 },
	{ tokens: ["ELABORATE"], response: 24 },
	{ tokens: ["HELLO"], response: 10 },
	{ tokens: ["HI"], response: 10 },
	{ tokens: ["HOW", "ARE", "YOU"], response: 10 },
	{ tokens: ["WHY"], response: 200 },
	{ tokens: ["HOW"], response: 200 },
	{ tokens: ["WHAT"], response: 200 },
	{ tokens: ["WHO"], response: 200 },
	{ tokens: ["WHERE"], response: 200 },
	{ tokens: ["WHEN"], response: 200 },
	{ tokens: ["DOCTOR"], response: 150 },
	{ tokens: ["HOSPITAL"], response: 70 },
	{ tokens: ["FEEL"], response: 21 },
	{ tokens: ["THINK"], response: 600 },
	{ tokens: ["WANT"], response: 1020 },
	{ tokens: ["MAFIA"], response: 528 },
	{ tokens: ["GUN"], response: 528 },
	{ tokens: ["KILL"], response: 528 },
	{ tokens: ["DEATH"], response: 528 },
	{ tokens: ["CRIME"], response: 528 },
];

const BELIEFS: Belief[] = [
	{ name: "HORSE", strength: 1, category: "HUM", negated: false },
	{ name: "HORSESET", strength: 0, category: "HUM", negated: false },
	{ name: "HORSERACINGSET", strength: 0, category: "HUM", negated: false },
	{ name: "MONEYSET", strength: 0, category: "HUM", negated: false },
	{ name: "GAMBLERSET", strength: 0, category: "HUM", negated: false },
	{ name: "BOOKIESET", strength: 0, category: "HUM", negated: false },
	{ name: "CHEATSET", strength: 0, category: "HUM", negated: false },
	{ name: "GANGSTERSET", strength: 0, category: "HUM", negated: false },
	{ name: "RACKETSET", strength: 0, category: "HUM", negated: false },
	{ name: "MAFIASET", strength: 0, category: "HUM", negated: false },
	{ name: "DELUSIONS", strength: 0, category: "HUM", negated: false },
];

const INFERENCES: Inference[] = [
	{ type: "TH2", condition: ["HORSE"], consequences: ["HORSESET"] },
	{ type: "TH2", condition: ["HORSESET"], consequences: ["HORSERACINGSET"] },
	{ type: "TH2", condition: ["HORSERACINGSET"], consequences: ["MONEYSET"] },
	{ type: "TH2", condition: ["MONEYSET"], consequences: ["GAMBLERSET"] },
	{ type: "TH2", condition: ["GAMBLERSET"], consequences: ["BOOKIESET"] },
	{ type: "TH2", condition: ["BOOKIESET"], consequences: ["CHEATSET"] },
	{ type: "TH2", condition: ["CHEATSET"], consequences: ["GANGSTERSET"] },
	{ type: "TH2", condition: ["GANGSTERSET"], consequences: ["RACKETSET"] },
	{ type: "TH2", condition: ["RACKETSET"], consequences: ["MAFIASET"] },
	{ type: "EMOTE", condition: ["FJUMP", "0.3"], consequences: ["MAFIASET"] },
	{ type: "EMOTE", condition: ["AJUMP", "0.5"], consequences: ["GANGSTERSET"] },
	{ type: "EMOTE", condition: ["HJUMP", "0.4"], consequences: ["CHEATSET"] },
];

const FLARE_MAP: Record<string, string> = {
	HORSE: "HORSESET",
	RACES: "HORSERACINGSET",
	RACE: "HORSERACINGSET",
	MONEY: "MONEYSET",
	GAMBL: "GAMBLERSET",
	BET: "GAMBLERSET",
	BOOKI: "BOOKIESET",
	CROOK: "BOOKIESET",
	CHEAT: "CHEATSET",
	GANGSTER: "GANGSTERSET",
	HOOD: "GANGSTERSET",
	RACKET: "RACKETSET",
	MAFIA: "MAFIASET",
	ITALI: "ITALIANSET",
	POLICE: "POLICESET",
};

const FLARE_WEIGHTS: Record<string, number> = {
	HORSESET: 1,
	HORSERACINGSET: 2,
	MONEYSET: 3,
	GAMBLERSET: 4,
	BOOKIESET: 5,
	CHEATSET: 6,
	GANGSTERSET: 7,
	RACKETSET: 8,
	MAFIASET: 9,
};

const FLARE_RESPONSES: Record<string, string> = {
	HORSESET: "I USED TO GO TO THE RACES SOMETIMES.",
	HORSERACINGSET: "I KNOW PEOPLE WHO GO TO THE TRACK. THEY LOSE MONEY.",
	MONEYSET: "MONEY IS TIGHT. I DON'T HAVE MUCH.",
	GAMBLERSET: "I'VE DONE SOME GAMBLING. IT'S DANGEROUS.",
	BOOKIESET: "BOOKIES ARE CROOKED. THEY WORK FOR THE MAFIA.",
	CHEATSET: "PEOPLE ARE ALWAYS TRYING TO CHEAT ME.",
	GANGSTERSET: "THE GANGSTERS ARE INVOLVED IN EVERYTHING.",
	RACKETSET: "THE RACKETS ARE RUN BY ORGANIZED CRIME.",
	MAFIASET: "THE MAFIA IS OUT TO GET ME. THEY'VE BEEN FOLLOWING ME.",
};

const SYNTHETIC: Record<number, string[]> = {
	0: ["I DON'T KNOW WHAT YOU MEAN.", "WHAT?", "I DON'T FOLLOW."],
	8: ["I SEE.", "OK."],
	10: ["WHAT DO YOU WANT?", "YEAH? WHAT IS IT?"],
	16: ["GO ON.", "KEEP TALKING."],
	17: ["I DON'T KNOW.", "MAYBE.", "I'M NOT SURE."],
	21: [
		"I DON'T LIKE TALKING ABOUT FEELINGS.",
		"WHY DO YOU KEEP ASKING ABOUT FEELINGS?",
	],
	24: ["WHAT IS THERE TO SAY?", "I DON'T HAVE MUCH TO SAY ABOUT IT."],
	42: ["WHAT DO YOU WANT TO TALK ABOUT?", "I'M HERE. WHAT NOW?"],
	56: ["I'M IN THE HOSPITAL. THEY PUT ME HERE.", "I SHOULDN'T BE IN HERE."],
	70: ["THE DOCTORS DON'T REALLY LISTEN.", "DOCTORS ARE ALL THE SAME."],
	104: ["I DON'T TRUST DOCTORS.", "DOCTORS ACT LIKE THEY KNOW EVERYTHING."],
	128: ["THAT'S A FUNNY QUESTION.", "WHY WOULD YOU ASK THAT?"],
	150: [
		"WHY ARE YOU SO INTERESTED IN THE DOCTOR?",
		"THE DOCTOR IS IN ON IT TOO.",
	],
	200: ["WHY DO YOU WANT TO KNOW?", "WHAT BUSINESS IS IT OF YOURS?"],
	384: ["I CAN'T EXPLAIN IT.", "IT'S COMPLICATED.", "YOU WOULDN'T UNDERSTAND."],
	408: ["WHAT ABOUT ME?", "WHY ARE YOU ASKING ABOUT ME?"],
	528: [
		"THE MAFIA IS AFTER ME. THAT'S WHAT I THINK.",
		"I'M BEING FOLLOWED BY THE MAFIA.",
	],
	600: [
		"THERE'S NOTHING TO TELL.",
		"I DON'T WANT TO TALK ABOUT MYSELF.",
		"WHAT ABOUT YOU INSTEAD?",
	],
	630: [
		"WHY DO YOU KEEP ASKING ABOUT ME?",
		"WHAT DO YOU WANT?",
		"THAT'S MY BUSINESS.",
	],
	1020: [
		"I WANT TO GET OUT OF HERE.",
		"THEY WON'T LET ME LEAVE.",
		"I SHOULDN'T BE HERE.",
	],
	1432: ["I DON'T KNOW WHAT TO SAY.", "I CAN'T ANSWER THAT."],
	1536: ["WHAT MAKES YOU SAY THAT?", "THAT'S WHAT YOU THINK."],
	1970: ["MAYBE.", "I DON'T KNOW."],
	1992: ["THAT'S WHAT I THINK.", "YEAH, I GUESS SO."],
	3000: ["WHAT DO YOU MEAN BY THAT?", "I DON'T FOLLOW YOU."],
	4924: ["I DON'T KNOW WHAT YOU'RE TALKING ABOUT.", "YOU'RE NOT MAKING SENSE."],
	5004: ["THAT'S NOT TRUE.", "YOU'RE WRONG ABOUT THAT."],
	5134: ["I DON'T CARE.", "IT DOESN'T MATTER."],
	5168: ["I DON'T TRUST ANYONE.", "YOU CAN'T TRUST PEOPLE."],
	5195: ["I'M NOT COMFORTABLE TALKING ABOUT THAT."],
	5228: ["I'M NOT SURE.", "I DON'T HAVE AN OPINION."],
	5229: ["THAT'S ABOUT ME.", "THAT'S PERSONAL."],
	5230: ["I DON'T KNOW WHAT YOU'RE GETTING AT."],
	5231: ["I'M TIRED OF QUESTIONS.", "CAN WE TALK ABOUT SOMETHING ELSE?"],
	5244: ["I DON'T HAVE MUCH TO SAY.", "THAT'S ALL THERE IS TO IT."],
};

const DEL_NOUNS = ["MAFIA", "GUN", "DEATH", "CHIEF"];
const DEL_VERBS = ["KILL", "SPY"];
const DEL_AMBIGUOUS = ["BEAT", "HATE"];

export class Parry {
	private synonyms = new Map<string, string>();
	private patterns: Pattern[] = SIMPLE_PATTERNS;
	private beliefs: Belief[] = BELIEFS.map((b) => ({ ...b }));
	private inferences: Inference[] = INFERENCES;
	private emotions: Emotions = { anger: 0, fear: 0, mistrust: 0, hurt: 0 };
	private jumps: EmotionJumps = { ajump: 0, fjump: 0, hjump: 0 };
	private delFlag = false;
	private flare = "INIT";
	private liveFlares = [
		"HORSESET",
		"HORSERACINGSET",
		"MONEYSET",
		"GAMBLERSET",
		"BOOKIESET",
		"CHEATSET",
		"GANGSTERSET",
		"RACKETSET",
		"MAFIASET",
	];
	private deadFlares: string[] = [];
	private lastKw = new Map<string, number>();

	constructor() {
		for (const [from, to] of SYNONYMS) {
			this.synonyms.set(from, to);
		}
	}

	greeting(): string {
		return "HOW DO YOU DO.  PLEASE TELL ME YOUR PROBLEM.";
	}

	reset(): void {
		this.emotions = { anger: 0, fear: 0, mistrust: 0, hurt: 0 };
		this.jumps = { ajump: 0, fjump: 0, hjump: 0 };
		this.delFlag = false;
		this.flare = "INIT";
		this.deadFlares = [];
		this.lastKw.clear();
	}

	private wordCanonical(word: string): string {
		const upper = word.toUpperCase();
		return this.synonyms.get(upper) ?? upper;
	}

	private canonicalTokenize(input: string): string[] {
		const text = input
			.toUpperCase()
			.replace(/[^A-Z0-9\s]/g, " ")
			.replace(/\s+/g, " ")
			.trim();
		return text
			.split(/\s+/)
			.filter(Boolean)
			.map((w) => {
				const c = this.wordCanonical(w);
				return c.length > 5 ? c.slice(0, 5) : c;
			});
	}

	private matchTokens(input: string[], pattern: string[]): boolean {
		if (pattern.length === 0) {
			return true;
		}
		if (pattern.length > input.length) {
			return false;
		}
		for (let start = 0; start <= input.length - pattern.length; start++) {
			let ok = true;
			for (let i = 0; i < pattern.length; i++) {
				if (pattern[i] !== input[start + i]) {
					ok = false;
					break;
				}
			}
			if (ok) {
				return true;
			}
		}
		return false;
	}

	private matchPatterns(tokens: string[]): number | null {
		for (const pat of this.patterns) {
			if (this.matchTokens(tokens, pat.tokens)) {
				return pat.response;
			}
		}
		return null;
	}

	private modifyVariables() {
		this.emotions.anger = Math.max(this.emotions.anger - 1, 0);
		this.emotions.hurt = Math.max(this.emotions.hurt - 0.5, 0);
		if (this.delFlag) {
			this.emotions.fear = Math.max(this.emotions.fear - 0.1, 5);
		} else if (this.flare === "INIT") {
			this.emotions.fear = Math.max(this.emotions.fear - 0.3, 0);
		} else {
			this.emotions.fear = Math.max(this.emotions.fear - 0.2, 3);
		}
		this.emotions.mistrust = Math.max(this.emotions.mistrust - 0.05, 0);
		this.jumps = { ajump: 0, fjump: 0, hjump: 0 };
	}

	private applyEmotionalJumps() {
		this.emotions.anger += this.jumps.ajump;
		this.emotions.fear += this.jumps.fjump;
		this.emotions.hurt += this.jumps.hjump;
		this.emotions.mistrust += this.jumps.hjump * 0.5;
	}

	private applyInferences() {
		for (const inf of this.inferences) {
			if (inf.type === "TH2") {
				const bel = this.beliefs.find((b) => b.name === inf.condition[0]);
				if (bel && bel.strength > 0) {
					bel.strength = Math.max(0, bel.strength - 2);
					for (const cons of inf.consequences) {
						const cb = this.beliefs.find((b) => b.name === cons);
						if (cb) {
							cb.strength = Math.min(5, cb.strength + 1);
						}
					}
				}
			} else if (inf.type === "EMOTE") {
				const jt = inf.condition[0];
				const ja = Number.parseFloat(inf.condition[1]);
				for (const bn of inf.consequences) {
					const bel = this.beliefs.find((b) => b.name === bn);
					if (bel && bel.strength > 0) {
						if (jt === "AJUMP") {
							this.jumps.ajump += ja;
						} else if (jt === "FJUMP") {
							this.jumps.fjump += ja;
						} else if (jt === "HJUMP") {
							this.jumps.hjump += ja;
							this.jumps.ajump += ja * 0.5;
						}
					}
				}
			}
		}
	}

	private getFlareSet(word: string): string | null {
		for (const [key, val] of Object.entries(FLARE_MAP)) {
			if (word.startsWith(key)) {
				return val;
			}
		}
		return null;
	}

	private checkFlare(inp: string[]): boolean {
		let nf = "INIT";
		let result = false;
		let wt = 0;
		for (const word of inp) {
			const fs = this.getFlareSet(word);
			if (
				fs &&
				(this.liveFlares.includes(fs) || this.deadFlares.includes(fs))
			) {
				const fwt = FLARE_WEIGHTS[fs] ?? 0;
				if (fwt > wt) {
					nf = word;
					result = true;
					wt = fwt;
				}
			}
		}
		if (result && (this.flare === "INIT" || wt > 1)) {
			this.flare = nf;
			return true;
		}
		return false;
	}

	private delCheck(inp: string[]): boolean {
		for (const w of inp) {
			if (DEL_NOUNS.includes(w) || DEL_VERBS.includes(w)) {
				return true;
			}
			if (this.emotions.mistrust > 10 && DEL_AMBIGUOUS.includes(w)) {
				return true;
			}
		}
		return false;
	}

	private pick(keyword: string, alternatives: number[]): number {
		const avoid = this.lastKw.get(keyword);
		const filtered = alternatives.filter((_, i) => i !== avoid);
		const idx =
			filtered.length > 0
				? filtered[Math.floor(Math.random() * filtered.length)]
				: alternatives[Math.floor(Math.random() * alternatives.length)];
		const actualIdx = alternatives.indexOf(idx);
		this.lastKw.set(keyword, actualIdx);
		return idx;
	}

	private synthetic(n: number): string {
		const alts = SYNTHETIC[n];
		if (!alts) {
			return "I DON'T KNOW.";
		}
		return alts[Math.floor(Math.random() * alts.length)];
	}

	private expressFlare(setName: string): string {
		return FLARE_RESPONSES[setName] ?? "I DON'T KNOW WHAT YOU MEAN.";
	}

	private finalizeResponse(resp: string): string {
		const tokens = this.canonicalTokenize(resp);
		for (const word of tokens) {
			const fs = this.getFlareSet(word);
			if (fs && this.liveFlares.includes(fs)) {
				this.liveFlares = this.liveFlares.filter((f) => f !== fs);
				if (!this.deadFlares.includes(fs)) {
					this.deadFlares.push(fs);
				}
			}
		}
		if (tokens.includes("MAFIA")) {
			this.delFlag = true;
			this.flare = "INIT";
		}
		return resp;
	}

	response(input: string): string {
		const tokens = this.canonicalTokenize(input);

		this.modifyVariables();
		this.applyInferences();
		this.applyEmotionalJumps();

		const patNum = this.matchPatterns(tokens);
		if (patNum !== null) {
			const r = this.synthetic(patNum);
			return this.finalizeResponse(r);
		}

		if (tokens.includes("GO") || tokens.includes("CONTINUE")) {
			return this.finalizeResponse(this.synthetic(16));
		}
		if (tokens.includes("ELAB")) {
			return this.finalizeResponse(this.synthetic(24));
		}

		if (this.checkFlare(tokens)) {
			const fs = this.getFlareSet(this.flare);
			if (fs) {
				return this.finalizeResponse(this.expressFlare(fs));
			}
		}

		if (this.delCheck(tokens)) {
			this.jumps.fjump = this.delFlag ? 0.4 : 0.5;
			this.delFlag = true;
			this.flare = "INIT";
			return this.finalizeResponse(this.synthetic(1020));
		}

		if (tokens[0] === "WHY" || tokens[0] === "HOW") {
			return this.finalizeResponse(this.synthetic(200));
		}

		if (tokens.includes("HELLO") || tokens.includes("HI")) {
			return this.finalizeResponse(this.synthetic(10));
		}

		const kwMap: Record<string, number[]> = {
			I: [600, 630, 4924],
			YOU: [630, 600, 408],
			DOCTOR: [150, 104, 70],
			HOSPITAL: [70, 56, 150],
			FEEL: [21, 384, 4924],
			THINK: [600, 384, 4924],
			WANT: [1020, 528, 128],
		};
		for (const [kw, alts] of Object.entries(kwMap)) {
			if (tokens.includes(kw)) {
				return this.finalizeResponse(this.synthetic(this.pick(kw, alts)));
			}
		}

		return this.finalizeResponse("I SEE, PLEASE GO ON.");
	}
}
