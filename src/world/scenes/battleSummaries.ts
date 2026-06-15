export interface BattleSummary {
  name: string;
  date: string;
  location: string;
  historicalContext: string;
  combatants: {
    sideA: { name: string; strength: number };
    sideB: { name: string; strength: number };
  };
  briefingMessage: string;
}

export const battleSummaries: Record<string, BattleSummary> = {
  "Battle of Legnica": {
    name: "Battle of Legnica",
    date: "April 9, 1241",
    location: "Legnica, Silesia (modern Poland)",
    historicalContext: "Part of the Mongol invasion of Europe. After devastating Poland and Hungary, Mongol forces under Baidar and Kadan clashed with a coalition of Polish knights, Teutonic Knights, and Silesian forces led by Duke Henry II the Pious. Crushing defeat of the coalition by the hand of the Mongols.",
    combatants: {
      sideA: { name: "Mongol Empire", strength: 8000 },
      sideB: { name: "Polish & Teutonic Knights", strength: 6000 }
    },
    briefingMessage: "This is intended to be your first battle. You will face Mongol forces and try to drive them back, unlike what happened in the actual historical event."
  },
  "Battle of Ain Jalut": {
    name: "Battle of Ain Jalut",
    date: "September 3, 1260",
    location: "Ain Jalut, Galilee (modern Israel)",
    historicalContext: "The first major defeat of the Mongol Empire. Mamluk forces under Sultan Qutuz and Baybars stopped the westward Mongol expansion, saving Egypt and the Islamic world from conquest.",
    combatants: {
      sideA: { name: "Mamluk Sultanate", strength: 12000 },
      sideB: { name: "Mongol Ilkhanate", strength: 10000 }
    },
    briefingMessage: "A battle with a moutain. You will again face Mongols, repeating what happened in History by driving them back."
  },
  "Siege of Constantinople": {
    name: "Siege of Constantinople",
    date: "April 12 - April 13, 1204",
    location: "Constantinople (modern Istanbul, Turkey)",
    historicalContext: "The Crusaders of the Forth Crusade sieged Constantinople, which was then under control of the Byzantines. The Crusaders sacked Constantinople, and crowned Baldwin IX of Flanders as the king of a new empire",
    combatants: {
      sideA: { name: "Crusaders", strength: 22000 },
      sideB: { name: "Byzantine Empire", strength: 15000 }
    },
    briefingMessage: "A city battle. You will protect the city from the Crusaders., This does not follow the historical outcome."
  },
  "Battle of Agincourt": {
    name: "Battle of Agincourt",
    date: "October 25, 1415",
    location: "Agincourt, northern France",
    historicalContext: "A major English victory in the Hundred Years' War. Henry V's longbowmen decimated the French nobility on a muddy field, demonstrating the power of the English longbow against heavy cavalry.",
    combatants: {
      sideA: { name: "Kingdom of England", strength: 9000 },
      sideB: { name: "Kingdom of France", strength: 20000 }
    },
    briefingMessage: "Another city battle, kinda. You will face English forces and try to defend the city. This does not follow the historical outcome."
  },
  "Siege of Orléans": {
    name: "Siege of Orléans",
    date: "October 1428 - May 1429",
    location: "Orléans, France",
    historicalContext: "The turning point of the Hundred Years' War. Joan of Arc led the French to lift the English siege, boosting French morale and paving the way for Charles VII's coronation.",
    combatants: {
      sideA: { name: "Kingdom of France", strength: 10000 },
      sideB: { name: "Kingdom of England", strength: 5000 }
    },
    briefingMessage: "Here you will face the French forces and try to take Orléans. This does not follow the historical outcome."
  },
  "Fall of Constantinople": {
    name: "Fall of Constantinople",
    date: "April 6 - May 29, 1453",
    location: "Constantinople (modern Istanbul, Turkey)",
    historicalContext: "The Ottoman Empire under Sultan Mehmed II conquered the Byzantine capital, ending the Eastern Roman Empire after 1,100 years. The fall of Constantinople marked a turning point in world history.",
    combatants: {
      sideA: { name: "Ottoman Empire", strength: 80000 },
      sideB: { name: "Byzantine Empire", strength: 7000 }
    },
    briefingMessage: "Here you will face the Byzantine forces and try to capture Constantinople. This follows the historical outcome."
  },
  "Battle of Ridaniya": {
    name: "Battle of Ridaniya",
    date: "January 22, 1517",
    location: "Ridaniya, near Cairo, Egypt",
    historicalContext: "Ottoman Sultan Selim I defeated the Mamluk Sultanate, annexing Egypt, Syria, and the Hejaz into the Ottoman Empire. This gave the Ottomans control over the holy cities of Mecca and Medina.",
    combatants: {
      sideA: { name: "Ottoman Empire", strength: 60000 },
      sideB: { name: "Mamluk Sultanate", strength: 40000 }
    },
    briefingMessage: "Here you will face the Mamluk forces and try to defeat them. This follows the historical outcome."
  },
  "Battle of Pavia (Italian Wars)": {
    name: "Battle of Pavia",
    date: "February 24, 1525",
    location: "Pavia, Lombardy (modern Italy)",
    historicalContext: "Decisive Habsburg victory over France in the Italian Wars. King Francis I of France was captured, leading to the Treaty of Madrid and Habsburg dominance in Italy.",
    combatants: {
      sideA: { name: "Habsburg Empire (Charles V)", strength: 23000 },
      sideB: { name: "Kingdom of France", strength: 26000 }
    },
    briefingMessage: "Here you will fight Italian forces and defeat them. Foggy battle. This does not follow the historical outcome."
  },
  "Siege of Vienna": {
    name: "Siege of Vienna",
    date: "July 17 - September 12, 1683",
    location: "Vienna, Austria",
    historicalContext: "The Ottoman Empire's second siege of Vienna was repelled by a coalition led by Polish King John III Sobieski. The defeat marked the beginning of Ottoman decline in Europe.",
    combatants: {
      sideA: { name: "Holy League (Poland, Habsburgs, etc.)", strength: 70000 },
      sideB: { name: "Ottoman Empire", strength: 150000 }
    },
    briefingMessage: "Here you will face the Polish elite cavalry and successfully siege the city. This does not follow the historical outcome."
  },
  "Battle of Yorktown": {
    name: "Battle of Yorktown",
    date: "September 28 - October 19, 1781",
    location: "Yorktown, Virginia, USA",
    historicalContext: "The decisive battle of the American Revolutionary War. American and French forces under Washington and Rochambeau trapped Cornwallis's British army, leading to British surrender and eventual American independence.",
    combatants: {
      sideA: { name: "American & French Allies", strength: 17000 },
      sideB: { name: "Great Britain", strength: 9000 }
    },
    briefingMessage: "You will face British forces and defeat them. This follows the historical outcome."
  },
  "Battle of Three Emperors": {
    name: "Battle of Three Emperors",
    date: "December 2, 1805",
    location: "Austerlitz, Moravia (modern Czech Republic)",
    historicalContext: "Also known as the Battle of Austerlitz, this was Napoleon's greatest victory. The French Grand Armée defeated the combined armies of Austria and Russia, leading to the dissolution of the Holy Roman Empire.",
    combatants: {
      sideA: { name: "French Empire", strength: 68000 },
      sideB: { name: "Austrian & Russian Empires", strength: 85000 }
    },
    briefingMessage: "You face French forces here. You will try to defeat them. This does not follow the historical outcome."
  },
  "Battle of Gettysburg": {
    name: "Battle of Gettysburg",
    date: "July 1-3, 1863",
    location: "Gettysburg, Pennsylvania, USA",
    historicalContext: "The turning point of the American Civil War. Lee's Confederate Army of Northern Virginia was repelled by Union forces under Meade, ending the Confederate invasion of the North and beginning the long retreat to eventual surrender.",
    combatants: {
      sideA: { name: "Union Army", strength: 93000 },
      sideB: { name: "Confederate Army", strength: 75000 }
    },
    briefingMessage: "You will face Confederate forces and try to defeat them. This follows the historical outcome."
  },
  "Battle of Verdun": {
    name: "Battle of Verdun",
    date: "February 21 - December 18, 1916",
    location: "Verdun, France",
    historicalContext: "One of the longest and bloodiest battles of World War I. Germany sought to 'bleed France white' through attrition. The battle became a symbol of French determination with the motto 'They shall not pass.'",
    combatants: {
      sideA: { name: "France", strength: 300000 },
      sideB: { name: "German Empire", strength: 330000 }
    },
    briefingMessage: "You will face German forces and try to defend the city. This does follows the historical outcome."
  },
  "Battle of Gallipoli": {
    name: "Battle of Gallipoli",
    date: "February 19, 1915 - January 9, 1916",
    location: "Gallipoli Peninsula, Ottoman Empire (modern Turkey)",
    historicalContext: "An Allied amphibious assault to capture the Ottoman capital and secure a sea route to Russia. The campaign failed disastrously, costing over 500,000 casualties and becoming a defining moment for Australian and Turkish national identity.",
    combatants: {
      sideA: { name: "Allied Powers (Britain, France, ANZAC)", strength: 489000 },
      sideB: { name: "Ottoman Empire", strength: 315000 }
    },
    briefingMessage: "You will face British forces here and try to defend the peninsula. This follows the historical outcome."
  },
  "Battle of Stalingrad": {
    name: "Battle of Stalingrad",
    date: "August 23, 1942 - February 2, 1943",
    location: "Stalingrad, Soviet Union (modern Volgograd, Russia)",
    historicalContext: "The deadliest battle in history with over 2 million casualties. The Soviet victory marked the turning point of World War II in Europe, destroying the German 6th Army and beginning the long Soviet push westward to Berlin.",
    combatants: {
      sideA: { name: "Soviet Union", strength: 1100000 },
      sideB: { name: "Axis Powers (Germany, Italy, Romania, etc.)", strength: 1000000 }
    },
    briefingMessage: "You will face Russian forces here and try to defend the city. This does not follow the historical outcome."
  },
  "Battle of Chosin Reservoir": {
    name: "Battle of Chosin Reservoir",
    date: "November 26 - December 13, 1960",
    location: "Chosin Reservoir, North Korea",
    historicalContext: "A decisive battle of the Korean War where UN forces, surrounded by massive Chinese forces in brutal winter conditions, fought their way out in a fighting retreat. Despite heavy losses, the evacuation preserved UN fighting strength.",
    combatants: {
      sideA: { name: "UN Command (USA, UK, Norway)", strength: 30000 },
      sideB: { name: "China", strength: 120000 }
    },
    briefingMessage: "You will face the Korean forces here and try to defeat them. This follows the historical outcome."
  },
  "Fall of Saigon": {
    name: "Fall of Saigon",
    date: "April 28-30, 1975",
    location: "Saigon, South Vietnam (modern Ho Chi Minh City, Vietnam)",
    historicalContext: "The capture of South Vietnam's capital by North Vietnamese forces, marking the end of the Vietnam War. The dramatic helicopter evacuations from the US Embassy became an iconic moment of the war's conclusion.",
    combatants: {
      sideA: { name: "North Vietnam & Viet Cong", strength: 100000 },
      sideB: { name: "South Vietnam & USA (evacuation)", strength: 25000 }
    },
    briefingMessage: "You will face the North Vietnamese and Viet Cong forces here and try to defeat them. This does not follow the historical outcome."
  },
  "Operation Abirey-Halev": {
    name: "Operation Abirey-Halev",
    date: "October 15-24, 1973",
    location: "Sinai Peninsula, Egypt/Suez Canal",
    historicalContext: "Also known as Operation Valiant, this was the Israeli counter-crossing of the Suez Canal during the Yom Kippur War. Israeli forces under Sharon crossed the canal, encircling the Egyptian Third Army and turning the tide of the war.",
    combatants: {
      sideA: { name: "Israel", strength: 15000 },
      sideB: { name: "Egypt", strength: 45000 }
    },
    briefingMessage: "You will face Israeli forces here and try to defeat them. This does not follow the historical outcome."
  },
  "Operation Anaconda": {
    name: "Operation Anaconda",
    date: "March 2-18, 2002",
    location: "Shah-i-Kot Valley, Afghanistan",
    historicalContext: "The largest battle of the War in Afghanistan's initial phase. US and coalition forces launched a major offensive against Al-Qaeda and Taliban fighters entrenched in mountain valleys, establishing the pattern for future counterinsurgency operations.",
    combatants: {
      sideA: { name: "US & Coalition Forces", strength: 3000 },
      sideB: { name: "Al-Qaeda & Taliban", strength: 1000 }
    },
    briefingMessage: "You will face Al-Qaeda and Taliban forces here and try to defeat them. This does follows the historical outcome."
  },
  "Battle of Kyiv": {
    name: "Battle of Kyiv",
    date: "February 26 - April 1, 2022",
    location: "Kyiv, Ukraine",
    historicalContext: "The opening battle of the 2022 Russian invasion of Ukraine. Ukrainian forces successfully defended the capital against a much larger Russian assault, inflicting heavy losses and forcing Russian withdrawal. A symbol of Ukrainian resistance.",
    combatants: {
      sideA: { name: "Ukraine", strength: 25000 },
      sideB: { name: "Russia", strength: 30000 }
    },
    briefingMessage: "You will face Russian forces here and try to defend the city. Although at the time of writing they have held the city strong for several years, the historical accuracy of the outcome is uncertain."
  },
  "Operation Arnon": {
    name: "Operation Arnon",
    date: "October 7, 2023",
    location: "Kissufim, Negev, Israel",
    historicalContext: "A rescue operation by the IDF's Shaldag Unit during the October 7 Hamas attacks. Israeli special forces crossed into Gaza to rescue hostages held by Hamas fighters, demonstrating the high-stakes nature of the conflict.",
    combatants: {
      sideA: { name: "Israel (IDF Shaldag Unit)", strength: 50 },
      sideB: { name: "Hamas", strength: 150 }
    },
    briefingMessage: "You will face Israeli forces here and try to defeat them. This does not follow the historical outcome."
  },
  "Northwood High School": {
    name: "Northwood High School",
    date: "???",
    location: "Silver Spring, Maryland, USA",
    historicalContext: "??????",
    combatants: {
      sideA: { name: "Side A", strength: 0 },
      sideB: { name: "Side B", strength: 0 }
    },
    briefingMessage: "The final fight, against a foe you may know. Are you ready? Not even remotely historical."
  }
};