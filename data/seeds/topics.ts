// Curated input for `pnpm gen:seeds` (see cli/gen-seeds.ts). Each topic carries ONLY the fields
// that need human judgment — the licensing-critical bits (source / attribution / allowNames) and a
// one-line factual `summary` to ground the model. The LLM drafts the creative skeleton
// (blurb / setting / characters / beats / themeHints); the result is written to lib/seeds/generated.ts
// and spread into STORY_SEEDS. "Import plots, not prose."
//
// Classification rule (matches the copyright gate in lib/seeds/presets.test.ts):
//   work    — a fable/parable from a public-domain classical text → publicDomain + attribution.
//   history — a real historical figure/event (history is nobody's IP) → allowNames carry the names.
//
// allowNames are proper-noun 人名/地名 only — NEVER the 4-character idiom itself (idioms stay plot-only;
// the idiom still shows as the seed `title` in the picker).

export interface SeedTopic {
  /** Stable slug — must be globally unique across ALL seeds (authored + generated). */
  id: string;
  /** Hanzi title (the idiom / story name), shown in the picker. */
  title: string;
  titleEn: string;
  source: 'history' | 'work';
  /** REQUIRED when source === 'work': the public-domain classical text. */
  attribution?: string;
  /** Hanzi proper nouns to force into the allowed set (人名/地名 only). */
  allowNames?: string[];
  /** One-line factual grounding for the model — NOT stored in the seed. */
  summary: string;
}

export const SEED_TOPICS: SeedTopic[] = [
  // --- 成语故事 from classical texts (public domain) -------------------------------------------
  {
    id: 'shou-zhu-dai-tu',
    title: '守株待兔',
    titleEn: 'Waiting by the Tree Stump',
    source: 'work',
    attribution: '《韩非子》 (Han Feizi) — public domain',
    summary:
        'A farmer sees a rabbit run into a tree stump and die, giving him a free meal; he abandons his farming to wait by the stump for more rabbits, and his field goes to ruin. Moral: do not rely on luck.',
  },
  {
    id: 'ke-zhou-qiu-jian',
    title: '刻舟求剑',
    titleEn: 'Carving the Boat to Find the Sword',
    source: 'work',
    attribution: '《吕氏春秋》 (Lüshi Chunqiu) — public domain',
    summary:
        'A man crossing a river drops his sword overboard; he carves a mark on the moving boat where it fell, meaning to dive there when the boat docks, not realizing the boat has moved on. Moral: do not ignore change.',
  },
  {
    id: 'hua-she-tian-zu',
    title: '画蛇添足',
    titleEn: 'Drawing Legs on a Snake',
    source: 'work',
    attribution: '《战国策》 (Strategies of the Warring States) — public domain',
    summary:
        'In a contest to draw a snake fastest for a prize of wine, the quickest finisher shows off by adding legs; another finishes and wins, because snakes have no legs. Moral: overdoing it ruins the result.',
  },
  {
    id: 'yu-gong-yi-shan',
    title: '愚公移山',
    titleEn: 'The Old Man Who Moved the Mountains',
    source: 'work',
    attribution: '《列子》 (Liezi) — public domain',
    summary:
        'An old man, vexed by two huge mountains blocking his door, resolves to dig them away with his family generation after generation; moved by his perseverance, the gods carry the mountains off. Moral: perseverance overcomes anything.',
  },
  {
    id: 'zi-xiang-mao-dun',
    title: '自相矛盾',
    titleEn: 'The Spear and the Shield',
    source: 'work',
    attribution: '《韩非子》 (Han Feizi) — public domain',
    summary:
        'A peddler boasts his spear can pierce any shield and his shield can block any spear; a bystander asks what happens if his spear strikes his shield, and he cannot answer. Moral: avoid self-contradiction.',
  },
  {
    id: 'ya-miao-zhu-zhang',
    title: '揠苗助长',
    titleEn: 'Pulling Up the Seedlings',
    source: 'work',
    attribution: '《孟子》 (Mengzi / Mencius) — public domain',
    summary:
        'A farmer impatient for his rice to grow taller pulls each seedling up by a little; by the next day all the plants have withered and died. Moral: forcing growth backfires.',
  },
  {
    id: 'wang-yang-bu-lao',
    title: '亡羊补牢',
    titleEn: 'Mending the Pen After the Sheep Is Lost',
    source: 'work',
    attribution: '《战国策》 (Strategies of the Warring States) — public domain',
    summary:
        'After a wolf takes a sheep through a gap in the pen, a shepherd ignores advice to fix it and loses another; he finally repairs the pen and loses no more sheep. Moral: it is never too late to fix a problem.',
  },
  {
    id: 'hu-jia-hu-wei',
    title: '狐假虎威',
    titleEn: 'The Fox Borrows the Tigers Might',
    source: 'work',
    attribution: '《战国策》 (Strategies of the Warring States) — public domain',
    summary:
        'A fox caught by a tiger claims heaven made it king of the beasts and dares the tiger to follow and watch the animals flee; they flee the tiger, but the fox takes the credit. Moral: some borrow others’ power to frighten.',
  },
  {
    id: 'ye-gong-hao-long',
    title: '叶公好龙',
    titleEn: 'Lord Ye Who Loved Dragons',
    source: 'work',
    attribution: '《新序》 (Xinxu), 刘向 — public domain',
    allowNames: ['叶公'],
    summary:
        'Lord Ye loves dragons and covers his house with dragon carvings and paintings; when a real dragon, flattered, comes to visit, he is terrified and flees. Moral: he loved the idea, not the reality.',
  },

  // --- history: real figures (history is nobody’s IP) ----------------------------------------
  {
    id: 'kong-rong-rang-li',
    title: '孔融让梨',
    titleEn: 'Kong Rong Gives Up the Pears',
    source: 'history',
    allowNames: ['孔融'],
    summary:
        'Four-year-old Kong Rong, offered a plate of pears, takes the smallest and gives the bigger ones to his elder brothers, saying the young should defer to their elders. Moral: courtesy and modesty.',
  },
  {
    id: 'cao-chong-cheng-xiang',
    title: '曹冲称象',
    titleEn: 'Cao Chong Weighs the Elephant',
    source: 'history',
    allowNames: ['曹冲'],
    summary:
        'Young Cao Chong weighs a giant elephant by floating it on a boat and marking the waterline, then replacing the elephant with stones until the boat sinks to the same mark, and weighing the stones. Moral: clever problem-solving.',
  },
  {
    id: 'wan-bi-gui-zhao',
    title: '完璧归赵',
    titleEn: 'Returning the Jade Intact to Zhao',
    source: 'history',
    allowNames: ['蔺相如', '赵'],
    summary:
        'Lin Xiangru carries the priceless He jade to a powerful king who offers cities for it; sensing deceit, he outwits the king and sends the jade safely back to the state of Zhao. Moral: courage and quick wit.',
  },
  {
    id: 'wo-xin-chang-dan',
    title: '卧薪尝胆',
    titleEn: 'Sleeping on Firewood, Tasting Gall',
    source: 'history',
    allowNames: ['勾践'],
    summary:
        'A defeated king, Goujian, sleeps on firewood and tastes bitter gall every day to keep his shame fresh, training his people for years until he finally defeats his enemy. Moral: perseverance through hardship.',
  },
  {
    id: 'zao-bi-tou-guang',
    title: '凿壁偷光',
    titleEn: 'Boring the Wall to Borrow the Light',
    source: 'history',
    allowNames: ['匡衡'],
    summary:
        'A poor boy, Kuang Heng, with no oil for a lamp, bores a small hole in his wall to borrow a neighbor’s lamplight so he can read at night, and grows up learned. Moral: dedication to study.',
  },
  {
    id: 'tie-chu-mo-zhen',
    title: '铁杵磨针',
    titleEn: 'Grinding an Iron Rod into a Needle',
    source: 'history',
    allowNames: ['李白'],
    summary:
        'A young Li Bai, skipping his studies, meets an old woman patiently grinding a thick iron rod to make a needle; her persistence shames him into studying hard. Moral: persistence achieves the impossible.',
  },
  {
    id: 'wen-ji-qi-wu',
    title: '闻鸡起舞',
    titleEn: 'Rising at the Rooster’s Crow to Train',
    source: 'history',
    allowNames: ['祖逖'],
    summary:
        'The ambitious Zu Ti and his friend rise at the rooster’s crow every dawn to practice swordplay, disciplining themselves to one day serve their country. Moral: diligence and ambition.',
  },

  // --- more 成语故事 from classical texts (public domain) ---------------------------------------
  {
    id: 'jing-di-zhi-wa',
    title: '井底之蛙',
    titleEn: 'The Frog in the Well',
    source: 'work',
    attribution: '《庄子》 (Zhuangzi) — public domain',
    summary:
        'A frog living at the bottom of a well boasts of his tiny world to a sea turtle, who describes the boundless ocean; the frog is stunned into silence. Moral: a narrow vantage point breeds a narrow mind.',
  },
  {
    id: 'lan-yu-chong-shu',
    title: '滥竽充数',
    titleEn: 'Filling the Ranks of the Flute Players',
    source: 'work',
    attribution: '《韩非子》 (Han Feizi) — public domain',
    allowNames: ['南郭先生'],
    summary:
        'Mr. Nanguo cannot play the yu (a reed pipe) but hides among a 300-player royal ensemble and draws a salary; when the new king demands solos one by one, he flees in panic. Moral: a bluff collapses under real scrutiny.',
  },
  {
    id: 'yan-er-dao-ling',
    title: '掩耳盗铃',
    titleEn: 'Covering the Ears to Steal the Bell',
    source: 'work',
    attribution: '《吕氏春秋》 (Lüshi Chunqiu) — public domain',
    summary:
        'A thief tries to carry off a big bell, but it clangs when struck; he covers his own ears so he cannot hear it, believing that means no one else can either, and is caught. Moral: you cannot make a fact vanish by ignoring it.',
  },
  {
    id: 'sai-weng-shi-ma',
    title: '塞翁失马',
    titleEn: 'The Old Man of the Frontier Loses His Horse',
    source: 'work',
    attribution: '《淮南子》 (Huainanzi) — public domain',
    allowNames: ['塞翁'],
    summary:
        'An old man near the frontier loses his horse, but it returns leading a fine wild one; his son is crippled falling from it, which then spares him from being drafted into a deadly war. Moral: misfortune and fortune turn into each other.',
  },
  {
    id: 'nan-yuan-bei-zhe',
    title: '南辕北辙',
    titleEn: 'Heading South by Steering North',
    source: 'work',
    attribution: '《战国策》 (Strategies of the Warring States) — public domain',
    summary:
        'A traveler bound for the southern state of Chu drives his chariot north, insisting his swift horses, ample money, and skilled driver will get him there; the better his means, the farther he strays. Moral: effort in the wrong direction only carries you further from the goal.',
  },
  {
    id: 'zhao-san-mu-si',
    title: '朝三暮四',
    titleEn: 'Three in the Morning, Four at Night',
    source: 'work',
    attribution: '《庄子》 (Zhuangzi) — public domain',
    summary:
        'A monkey keeper short on food offers his monkeys three acorns each morning and four each night; they rage, so he offers four in the morning and three at night, and they cheer — though the total never changed. Moral: people are swayed by framing, not substance.',
  },

  // --- 诗词 from public-domain poets (the poem is the `work`; the poet’s name goes in allowNames) ---
  {
    id: 'jing-ye-si',
    title: '静夜思',
    titleEn: 'Quiet Night Thoughts',
    source: 'work',
    attribution: '李白《静夜思》 (Li Bai, "Quiet Night Thoughts") — public domain',
    allowNames: ['李白'],
    summary:
        'Lying awake far from home, the poet mistakes bright moonlight on the floor for frost; he lifts his head toward the moon, then lowers it, aching with homesickness. Theme: moonlight and longing for home.',
  },
  {
    id: 'deng-guan-que-lou',
    title: '登鹳雀楼',
    titleEn: 'Climbing Stork Tower',
    source: 'work',
    attribution: '王之涣《登鹳雀楼》 (Wang Zhihuan, "Climbing Stork Tower") — public domain',
    allowNames: ['王之涣', '鹳雀楼', '黄河'],
    summary:
        'Atop Stork Tower the poet watches the white sun sink behind the mountains and the Yellow River roll toward the sea, and reflects that to see a thousand miles he must climb one more storey. Theme: ambition rewards those who rise higher.',
  },
  {
    id: 'chun-xiao',
    title: '春晓',
    titleEn: 'Spring Dawn',
    source: 'work',
    attribution: '孟浩然《春晓》 (Meng Haoran, "Spring Dawn") — public domain',
    allowNames: ['孟浩然'],
    summary:
        'Waking late on a spring morning to birdsong on every side, the poet recalls a night of wind and rain and wonders how many blossoms have fallen. Theme: the gentle, fleeting beauty of spring.',
  },
  {
    id: 'min-nong',
    title: '悯农',
    titleEn: 'Sympathy for the Farmers',
    source: 'work',
    attribution: '李绅《悯农》 (Li Shen, "Sympathy for the Farmers") — public domain',
    allowNames: ['李绅'],
    summary:
        'A farmer hoes his field at high noon, sweat dripping onto the soil; the poem asks whether anyone at the dinner table knows that every grain of rice in the bowl is won through such toil. Moral: cherish food and the labor behind it.',
  },
  {
    id: 'you-zi-yin',
    title: '游子吟',
    titleEn: 'Song of the Wandering Son',
    source: 'work',
    attribution: '孟郊《游子吟》 (Meng Jiao, "Song of the Wandering Son") — public domain',
    allowNames: ['孟郊'],
    summary:
        'A loving mother stitches her son’s travelling clothes before he departs, sewing tight for fear he will be long gone; the poet asks how a blade of grass can ever repay the warmth of spring sunlight. Theme: a mother’s boundless love and a child’s gratitude.',
  },
  {
    id: 'shui-diao-ge-tou',
    title: '水调歌头',
    titleEn: 'Prelude to Water Melody',
    source: 'work',
    attribution: '苏轼《水调歌头·明月几时有》 (Su Shi, "Prelude to Water Melody") — public domain',
    allowNames: ['苏轼'],
    summary:
        'On a Mid-Autumn night the poet drinks and asks the bright moon when it first appeared, longs for the heavens yet loves the human world, and wishes that loved ones far apart may live long and share the same moon. Theme: separation, the moon, and reunion. (A 词 / lyric set to a fixed tune, not a regulated shi poem.)',
  },
  {
    id: 'wang-lu-shan-pu-bu',
    title: '望庐山瀑布',
    titleEn: 'Gazing at Lushan Waterfall',
    source: 'work',
    attribution: '李白《望庐山瀑布》 (Li Bai, "Gazing at Lushan Waterfall") — public domain',
    allowNames: ['李白', '庐山'],
    summary:
        'Sunlight on Incense-Burner Peak raises a purple haze while a distant waterfall hangs like a river before the cliff; the torrent plunges three thousand feet, as if the Milky Way were tumbling from the highest heaven. Theme: awe at nature, told through soaring exaggeration.',
  },

  // --- more history: real figures & events ------------------------------------------------------
  {
    id: 'si-ma-guang-za-gang',
    title: '司马光砸缸',
    titleEn: 'Sima Guang Breaks the Water Vat',
    source: 'history',
    allowNames: ['司马光'],
    summary:
        'When a playmate falls into a huge water vat and is drowning, the boy Sima Guang — later a great historian — keeps his head and smashes the vat with a rock so the water rushes out and the child is saved. Moral: calm, decisive thinking in a crisis.',
  },
  {
    id: 'san-gu-mao-lu',
    title: '三顾茅庐',
    titleEn: 'Three Visits to the Thatched Cottage',
    source: 'history',
    allowNames: ['刘备', '诸葛亮'],
    summary:
        'The warlord Liu Bei journeys three times to the humble cottage of the reclusive strategist Zhuge Liang, waiting patiently until he agrees to serve; the partnership reshapes the age. Moral: sincerity and persistence win the loyalty of the worthy.',
  },
  {
    id: 'fu-jing-qing-zui',
    title: '负荆请罪',
    titleEn: 'Bearing Thorns to Beg Forgiveness',
    source: 'history',
    allowNames: ['廉颇', '蔺相如'],
    summary:
        'The proud general Lian Po, resentful of the minister Lin Xiangru, learns Lin avoided him only to keep their state strong; ashamed, Lian bares his back, carries a bundle of thorns to Lin’s gate, and begs to be punished — and the two become devoted friends. Moral: humility and putting the common good first.',
  },
  {
    id: 'po-fu-chen-zhou',
    title: '破釜沉舟',
    titleEn: 'Breaking the Cauldrons and Sinking the Boats',
    source: 'history',
    allowNames: ['项羽'],
    summary:
        'Before a decisive battle the general Xiang Yu has his army’s boats sunk and cooking cauldrons smashed, leaving only three days’ food, so his soldiers must win or die; they fight with desperate courage and triumph. Moral: total commitment with no line of retreat.',
  },
  {
    id: 'cheng-men-li-xue',
    title: '程门立雪',
    titleEn: 'Standing in the Snow at Cheng’s Door',
    source: 'history',
    allowNames: ['杨时', '程颐'],
    summary:
        'Two scholars call on their teacher Cheng Yi and find him dozing; rather than disturb him they wait respectfully outside until he wakes, by which time the snow at the door has piled a foot deep. Moral: deep respect for one’s teacher.',
  },
  {
    id: 'da-yu-zhi-shui',
    title: '大禹治水',
    titleEn: 'Yu the Great Tames the Floods',
    source: 'history',
    allowNames: ['大禹'],
    summary:
        'Facing catastrophic floods, Yu the Great abandons his father’s failed strategy of damming and instead dredges channels to guide the waters to the sea, laboring thirteen years and passing his own door three times without entering. Moral: dedication, and working with nature rather than against it.',
  },

  // --- 节日 / culture: living traditions + ancient folklore (nobody’s IP → history) --------------
  {
    id: 'chun-jie',
    title: '春节',
    titleEn: 'Spring Festival (Chinese New Year)',
    source: 'history',
    allowNames: ['春节', '年兽'],
    summary:
        'Legend says a beast named Nian came each New Year’s Eve to harm villagers until they found it feared the color red, firelight, and loud noise; so people paste red couplets, set off firecrackers, and stay up together for the reunion dinner. Theme: family reunion and driving out the old year’s bad luck.',
  },
  {
    id: 'duan-wu-jie',
    title: '端午节',
    titleEn: 'Dragon Boat Festival',
    source: 'history',
    allowNames: ['端午节', '屈原', '汨罗江'],
    summary:
        'The festival honors Qu Yuan, a loyal poet-minister of Chu who drowned himself in the Miluo River in grief over his state’s fall; villagers raced boats to reach him and threw rice into the water to protect his body, giving rise to dragon-boat races and zongzi. Theme: loyalty, remembrance, and tradition.',
  },
  {
    id: 'zhong-qiu-jie',
    title: '中秋节',
    titleEn: 'Mid-Autumn Festival',
    source: 'history',
    allowNames: ['中秋节', '嫦娥', '后羿'],
    summary:
        'On the night of the year’s roundest, brightest moon, families gather to eat mooncakes and gaze upward, where legend places Chang’e, who swallowed an elixir of immortality and floated up to live on the moon, parted from her husband Hou Yi. Theme: reunion under the full moon and longing across distance.',
  },
  {
    id: 'qi-xi-jie',
    title: '七夕节',
    titleEn: 'The Double Seventh Festival',
    source: 'history',
    allowNames: ['七夕节', '牛郎', '织女'],
    summary:
        'Separated across the Milky Way as punishment, the mortal cowherd Niulang and the heavenly weaver girl Zhinü are allowed to meet only once a year, on the seventh night of the seventh month, on a bridge formed by magpies. Theme: faithful love and a yearly reunion — China’s festival of romance.',
  },
  {
    id: 'qing-ming-jie',
    title: '清明节',
    titleEn: 'Qingming (Tomb-Sweeping) Festival',
    source: 'history',
    allowNames: ['清明节', '介子推'],
    summary:
        'In spring, families visit ancestral graves to sweep them and lay offerings, then enjoy outings amid the new green; the linked cold-food custom recalls Jie Zhitui, a loyal retainer who chose to die on a mountain rather than seek reward. Theme: honoring ancestors and the renewal of spring.',
  },

  // --- 名胜古迹 / famous places (real geography & history → history; 地名 go in allowNames) --------
  {
    id: 'chang-cheng',
    title: '长城',
    titleEn: 'The Great Wall',
    source: 'history',
    allowNames: ['长城', '秦始皇', '孟姜女'],
    summary:
        'Winding thousands of miles across mountains and desert, the Great Wall was joined and extended over many dynasties — famously under the First Emperor — to guard against northern raiders; legend tells of Meng Jiangnü, whose weeping for her dead husband collapsed a stretch of it. Theme: monumental effort, defense, and the human cost behind a wonder.',
  },
  {
    id: 'bing-ma-yong',
    title: '兵马俑',
    titleEn: 'The Terracotta Army',
    source: 'history',
    allowNames: ['兵马俑', '秦始皇', '西安'],
    summary:
        'Thousands of life-sized clay soldiers, horses, and chariots — each face distinct — were buried near Xi’an to guard the tomb of the First Emperor, and lay hidden for over two thousand years until farmers digging a well uncovered them in 1974. Theme: imperial power, ancient craftsmanship, and astonishing discovery.',
  },
  {
    id: 'gu-gong',
    title: '故宫',
    titleEn: 'The Forbidden City',
    source: 'history',
    allowNames: ['故宫', '北京'],
    summary:
        'In the heart of Beijing, the Forbidden City was the palace of Ming and Qing emperors for some five centuries — a vast walled maze of golden-roofed halls and courtyards that commoners could not enter; today it is a public museum. Theme: imperial grandeur now opened to all.',
  },
  {
    id: 'xi-hu',
    title: '西湖',
    titleEn: 'West Lake',
    source: 'history',
    allowNames: ['西湖', '杭州', '苏轼'],
    summary:
        'West Lake in Hangzhou has inspired poets for centuries with its misty water, willow-lined causeways, and arched bridges; the poet-official Su Shi built one of its famous causeways, and sites such as Broken Bridge feature in beloved legends. Theme: scenic beauty woven through with poetry and folklore.',
  },
  {
    id: 'huang-shan',
    title: '黄山',
    titleEn: 'Mount Huang (the Yellow Mountains)',
    source: 'history',
    allowNames: ['黄山', '徐霞客'],
    summary:
        'Mount Huang is famed for gnarled pines clinging to granite, oddly shaped peaks, hot springs, and a rolling sea of clouds; the great traveler Xu Xiake so admired it that he declared no other mountains need be seen once one has seen Huangshan. Theme: a sublime landscape that has drawn pilgrims and painters for ages.',
  },

  // --- 历史人物 / iconic historical figures (real people → history; 人名 in allowNames) -----------
  {
    id: 'qin-shi-huang',
    title: '秦始皇',
    titleEn: 'Qin Shi Huang, the First Emperor',
    source: 'history',
    allowNames: ['秦始皇'],
    summary:
        'Ying Zheng conquered the rival warring states and in 221 BC became the first emperor to unify China; he standardized the script, the currency, and weights and measures, joined the northern walls into the Great Wall, and built a vast tomb guarded by a terracotta army — yet ruled harshly, burning books and burying scholars. Theme: a unifier of immense ambition and ruthlessness.',
  },
  {
    id: 'han-wu-di',
    title: '汉武帝',
    titleEn: 'Emperor Wu of Han',
    source: 'history',
    allowNames: ['汉武帝', '匈奴', '张骞'],
    summary:
        'Emperor Wu reigned for over fifty years and raised the Han dynasty to a great power; he broke the long threat of the nomadic Xiongnu with bold young generals, sent the envoy Zhang Qian westward to open the routes that became the Silk Road, and made Confucianism the doctrine of the state. Theme: an empire-builder who reshaped a civilization.',
  },
  {
    id: 'huo-qu-bing',
    title: '霍去病',
    titleEn: 'Huo Qubing, the Young General',
    source: 'history',
    allowNames: ['霍去病', '匈奴', '卫青'],
    summary:
        'A brilliant young cavalry commander under Emperor Wu, Huo Qubing led lightning strikes deep into Xiongnu territory and won victory after victory; offered a fine mansion as reward, he is said to have refused, declaring there could be no thought of home while the Xiongnu were undefeated — and he died at only about twenty-three. Theme: dazzling talent and selfless devotion to duty.',
  },
  {
    id: 'yue-fei',
    title: '岳飞',
    titleEn: 'Yue Fei, the Loyal General',
    source: 'history',
    allowNames: ['岳飞', '秦桧'],
    summary:
        'A Southern Song general who fought to drive back the invading Jin armies, Yue Fei carried on his back the words his mother had tattooed there — to serve the country with perfect loyalty; recalled from the edge of victory by twelve urgent gold tablets, he was put to death on a fabricated charge engineered by the chancellor Qin Hui, and was honored ever after as a national hero. Theme: loyalty repaid with tragic injustice.',
  },
  {
    id: 'zhu-ge-liang',
    title: '诸葛亮',
    titleEn: 'Zhuge Liang, the Sage Strategist',
    source: 'history',
    allowNames: ['诸葛亮', '刘备'],
    summary:
        'Chancellor and chief strategist of Shu Han, Zhuge Liang was sought out by Liu Bei and served him and his heir with total devotion, vowing to give his all until death; renowned for wisdom and clever stratagems, he led repeated northern campaigns against the rival state of Wei and died in the field on his last expedition. Theme: the wise, faithful minister who gives everything to a cause.',
  },
  {
    id: 'guan-yu',
    title: '关羽',
    titleEn: 'Guan Yu, the God of Loyalty',
    source: 'history',
    allowNames: ['关羽', '刘备', '荆州'],
    summary:
        'A leading general of Liu Bei’s Shu Han, Guan Yu became the very emblem of loyalty and righteousness; bound to Liu Bei by a brotherhood celebrated in legend, he guarded Jingzhou until he was defeated and killed, and in later centuries was worshipped across China as a god of loyalty and war. Theme: martial honor and unbreakable faith, later raised to the divine.',
  },
  {
    id: 'kong-zi',
    title: '孔子',
    titleEn: 'Confucius',
    source: 'history',
    allowNames: ['孔子'],
    summary:
        'China’s most influential teacher, Confucius taught benevolence and proper conduct, insisted that learning should be open to everyone regardless of birth, and travelled from state to state hoping to persuade rulers to govern with virtue; the sayings his disciples gathered after his death shaped Chinese thought for over two thousand years. Theme: the teacher whose ideas outlived empires.',
  },
  {
    id: 'sun-wu',
    title: '孙武',
    titleEn: 'Sun Tzu, Master of War',
    source: 'history',
    allowNames: ['孙武', '阖闾'],
    summary:
        'A strategist of the Spring and Autumn period who served the state of Wu, Sun Wu wrote the treatise known as The Art of War, still studied around the world; to prove that discipline could be taught to anyone, he is said to have drilled the king’s palace women into orderly ranks until they obeyed his every command. Theme: the founder of strategic thinking, who prized discipline above all.',
  },

  // --- 历史事件 / famous historical events (real events → history; 人名/地名 in allowNames) --------
  {
    id: 'feng-huo-xi-zhu-hou',
    title: '烽火戏诸侯',
    titleEn: 'Fooling the Nobles with Beacon Fires',
    source: 'history',
    allowNames: ['周幽王', '褒姒', '犬戎'],
    summary:
        'To coax a smile from his rarely cheerful queen Bao Si, King You of Zhou lit the beacon fires that summoned his lords to rush and defend the capital; they came for nothing, and she laughed, so he did it again — but when the Quanrong tribes truly invaded, no lord answered the fires, the capital fell, and the Western Zhou came to an end. Moral: a ruler who toys with trust is left with none when it matters.',
  },
  {
    id: 'chu-han-zheng-ba',
    title: '楚汉争霸',
    titleEn: 'The Chu–Han Contention',
    source: 'history',
    allowNames: ['项羽', '刘邦', '虞姬'],
    summary:
        'After the fall of Qin, two rivals fought for the empire: the mighty warrior Xiang Yu and the shrewd Liu Bang; through tense feasts and shifting fortunes Liu Bang, who knew how to win and use able men, prevailed, while Xiang Yu — hearing the songs of his lost homeland rise on every side and parting from his beloved Yu Ji — met his end by the river. Theme: why character and the use of talent, more than raw strength, decide who wins an age.',
  },
  {
    id: 'bei-shui-yi-zhan',
    title: '背水一战',
    titleEn: 'Fighting with the River at Their Backs',
    source: 'history',
    allowNames: ['韩信', '井陉'],
    summary:
        'Facing a far larger Zhao army at the Jingxing pass, the Han general Han Xin drew up his outnumbered troops with a river directly behind them so that retreat was impossible; forced to win or die, his soldiers fought with desperate fury and shattered the enemy — a victory that defied the war manuals. Moral: with no way back, people find a strength they never knew they had.',
  },
  {
    id: 'han-xin-dian-bing',
    title: '韩信点兵',
    titleEn: 'Han Xin Counts His Troops',
    source: 'history',
    allowNames: ['韩信', '刘邦'],
    summary:
        'Han Xin, who rose from hunger and humiliation to become the Han’s greatest general, was a master of marshalling armies — tradition credits him with a clever trick for counting soldiers by reading the remainders as they lined up in rows of different sizes; when the emperor asked how large a force each man could lead, Liu Bang named a limit, but Han Xin answered that for him, the more troops the better. Theme: a singular genius for command.',
  },
  {
    id: 'zhi-shang-tan-bing',
    title: '纸上谈兵',
    titleEn: 'Theorizing Warfare on Paper',
    source: 'history',
    allowNames: ['赵括', '廉颇', '白起', '长平'],
    summary:
        'Zhao Kuo could recite every military classic and out-argue even his veteran father, yet he had never truly led men in battle; when he replaced the cautious old general Lian Po in command at Changping, the Qin general Bai Qi lured him into a trap and the entire Zhao army was destroyed. Moral: knowledge drawn from books alone, untested by real experience, can end in disaster.',
  },
];
