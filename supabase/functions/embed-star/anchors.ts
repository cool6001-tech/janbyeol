/**
 * 잔별 — 마음과 상황의 기준 문장
 * ---------------------------------------------------------------
 * 여기 적힌 문장들이 이 서비스의 자(尺)입니다. 글 하나가 올라오면 이 문장들
 * 중 어디에 가장 가까운지를 재서 마음과 상황을 정해요. 그러니 이 문장이
 * 어설프면 그 뒤의 모든 계산이 어설퍼집니다.
 *
 * 지키는 세 가지
 *
 *   ① **설명이 아니라 그 마음으로 쓴 한 줄.**
 *      "기쁨이란 즐거운 감정이다" 같은 사전식 문장은 실제 일기와 닮지 않습니다.
 *      "오늘 해냈다. 별거 아닌데 자꾸 웃음이 난다" 쪽이어야 해요.
 *
 *   ② **언어마다 같은 수, 같은 목록.**
 *      label 하나에 ko/en/ja 가 정확히 한 줄씩입니다. 한국어에만 슬픔 문장을
 *      더 넣으면 '한국어의 평균'에 슬픔이 섞이고, 그걸 빼는 순간 한국어 글만
 *      슬픔에서 멀어집니다 (meaning.sql 의 lang_centroids 참고).
 *
 *   ③ **번역이 아니라 그 언어의 일기.**
 *      한국어 문장을 그대로 옮기면 한국어 말투가 영어에 묻어납니다.
 *      같은 마음을 그 언어 사람이 혼잣말하듯 쓴 문장이어야 합니다.
 *
 * 큰 갈래(family)는 여덟 개 그대로입니다 — 별의 색과 자리가 이걸 씁니다.
 * 잘게 나눈 결(label)은 곁에 둘지 말지를 정하는 데만 씁니다.
 */

export type Anchor = { label: string; family?: string; ko: string; en: string; ja: string }

/* ---------------- 마음 — 여덟 갈래, 스물여섯 결 ---------------- */

export const FEELINGS: Anchor[] = [
  // 기쁨
  { label: '기쁨-성취', family: '기쁨',
    ko: '오늘 해냈다. 별거 아닌 일인데 자꾸 뿌듯하다.',
    en: 'I finally pulled it off today. It was small but I keep feeling proud.',
    ja: '今日はやり遂げた。小さなことなのに、何度も誇らしくなる。' },
  { label: '기쁨-설렘', family: '기쁨',
    ko: '내일이 기다려진다. 괜히 두근거려서 잠이 안 올 것 같다.',
    en: 'I cannot wait for tomorrow. My heart keeps racing a little.',
    ja: '明日が待ち遠しい。なんだか胸がそわそわして眠れそうにない。' },
  { label: '기쁨-감사', family: '기쁨',
    ko: '누가 나를 챙겨줬다. 그 말 한마디가 하루를 바꿨다.',
    en: 'Someone looked out for me today. One sentence changed the whole day.',
    ja: '誰かが気にかけてくれた。その一言で一日が変わった。' },
  { label: '기쁨-재미', family: '기쁨',
    ko: '별것도 아닌 일로 한참 웃었다. 배가 아플 만큼.',
    en: 'We laughed at something stupid for ages. My stomach hurt.',
    ja: 'くだらないことで長いこと笑った。お腹が痛くなるくらい。' },

  // 평온
  { label: '평온-안도', family: '평온',
    ko: '걱정하던 일이 잘 끝났다. 이제야 숨이 쉬어진다.',
    en: 'The thing I was dreading went fine. I can breathe again.',
    ja: '心配していたことが無事に終わった。やっと息ができる。' },
  { label: '평온-고요', family: '평온',
    ko: '창문을 열어두고 한참 가만히 있었다. 마음이 조용했다.',
    en: 'I sat by the open window for a long while. My mind was still.',
    ja: '窓を開けたまま、しばらくじっとしていた。心が静かだった。' },
  { label: '평온-여유', family: '평온',
    ko: '오늘은 서두르지 않았다. 천천히 걸어도 괜찮았다.',
    en: 'I did not rush today. Walking slowly was allowed.',
    ja: '今日は急がなかった。ゆっくり歩いてもよかった。' },

  // 그리움
  { label: '그리움-사람', family: '그리움',
    ko: '문득 그 사람 생각이 났다. 잘 지내고 있을까.',
    en: 'I thought of them out of nowhere. I wonder if they are doing okay.',
    ja: 'ふと、あの人のことを思い出した。元気にしているだろうか。' },
  { label: '그리움-시절', family: '그리움',
    ko: '그때가 자꾸 떠오른다. 다시 돌아갈 수는 없겠지.',
    en: 'I keep remembering how things used to be. There is no going back.',
    ja: 'あの頃が何度も浮かぶ。もう戻れないのだろう。' },
  { label: '그리움-장소', family: '그리움',
    ko: '예전에 살던 동네를 지나왔다. 골목이 그대로였다.',
    en: 'I walked past the neighbourhood where I used to live. The alley had not changed.',
    ja: '昔住んでいた町を通った。路地はそのままだった。' },

  // 슬픔
  { label: '슬픔-이별', family: '슬픔',
    ko: '헤어졌다. 아직 실감이 나지 않는다.',
    en: 'We broke up. It still has not sunk in.',
    ja: '別れた。まだ実感がない。' },
  { label: '슬픔-상실', family: '슬픔',
    ko: '그 사람을 보냈다. 이제 다시는 볼 수 없다.',
    en: 'I said goodbye for the last time. I will never see them again.',
    ja: 'あの人を見送った。もう二度と会えない。' },
  { label: '슬픔-자책', family: '슬픔',
    ko: '내가 잘못했다. 그때 왜 그렇게 말했을까.',
    en: 'It was my fault. Why did I say it like that.',
    ja: '私が悪かった。どうしてあんな言い方をしたんだろう。' },
  { label: '슬픔-서운', family: '슬픔',
    ko: '서운했다. 말은 못 했지만 마음에 남았다.',
    en: 'It hurt a little. I did not say anything but it stayed with me.',
    ja: '寂しかった。言わなかったけれど、心に残った。' },

  /* 마음이 남에게 가 있는 글.
     처음에 이걸 통째로 빠뜨렸습니다. 위의 결들은 전부 '내' 마음이에요 —
     내가 슬프고 내가 지치고 내가 불안한. 그런데 일기에서 가장 흔한 마음 중
     하나는 **남을 향한 마음**입니다. 아픈 가족, 힘들어 보이는 친구,
     누군가의 상실. 눈금이 없으니 '병원·아프다' 같은 말만 보고 피로로
     끌려갔습니다. 색은 가장 가까운 갈래를 따릅니다 — 남 걱정은 불안의
     한 종류이고, 남의 아픔이 내 아픔이 되는 건 슬픔의 한 종류이니까요. */
  { label: '슬픔-안쓰러움', family: '슬픔',
    ko: '그 사람이 안쓰럽다. 내가 해줄 수 있는 게 없어서 더 그렇다.',
    en: 'My heart aches for them. It is worse because there is nothing I can do.',
    ja: 'あの人が不憫でならない。何もしてあげられないから、なおさらだ。' },
  { label: '슬픔-애도', family: '슬픔',
    ko: '가까운 사람이 누군가를 잃었다. 무슨 말을 해야 할지 모르겠다.',
    en: 'Someone close to me lost a person they loved. I do not know what to say.',
    ja: '近しい人が大切な人を亡くした。何と言えばいいのか分からない。' },

  // 고독
  { label: '고독-혼자', family: '고독',
    ko: '하루 종일 혼자였다. 아무도 내 하루를 묻지 않았다.',
    en: 'I was alone all day. Nobody asked how it went.',
    ja: '一日中ひとりだった。誰も私の一日を聞かなかった。' },
  { label: '고독-소외', family: '고독',
    ko: '사람들 속에 있었는데도 나만 겉도는 것 같았다.',
    en: 'I was surrounded by people and still felt like the odd one out.',
    ja: '人の中にいたのに、自分だけ浮いている気がした。' },
  { label: '고독-단절', family: '고독',
    ko: '연락이 끊긴 지 오래다. 먼저 하기도 이제는 어색하다.',
    en: 'We stopped talking a long time ago. Reaching out first feels strange now.',
    ja: '連絡が途絶えて久しい。今さら自分から送るのも気まずい。' },

  // 피로
  { label: '피로-일', family: '피로',
    ko: '하루 종일 일했다. 지금은 그냥 피곤할 뿐이다.',
    en: 'Worked all day. Right now I am just tired.',
    ja: '一日中働いた。今はただ疲れている。' },
  { label: '피로-몸', family: '피로',
    ko: '몸이 무겁다. 자도 자도 개운하지 않다.',
    en: 'My body feels heavy. No amount of sleep helps.',
    ja: '体が重い。いくら寝てもすっきりしない。' },
  { label: '피로-소진', family: '피로',
    ko: '아무것도 하기 싫다. 의욕이라는 게 남아 있지 않다.',
    en: 'I do not want to do anything. There is no drive left in me.',
    ja: '何もしたくない。やる気というものが残っていない。' },

  // 불안
  { label: '불안-앞날', family: '불안',
    ko: '앞으로 어떻게 될지 모르겠다. 그 생각에 잠이 안 온다.',
    en: 'I have no idea what happens next. The thought keeps me awake.',
    ja: 'これからどうなるのか分からない。そのことで眠れない。' },
  { label: '불안-관계', family: '불안',
    ko: '내가 뭘 잘못했나 싶다. 자꾸 눈치가 보인다.',
    en: 'I keep wondering if I did something wrong. I am walking on eggshells.',
    ja: '何か悪いことをしたのかと思ってしまう。つい顔色をうかがう。' },
  { label: '불안-조급', family: '불안',
    ko: '나만 뒤처지는 것 같다. 마음이 자꾸 급해진다.',
    en: 'It feels like everyone moved ahead without me. I keep rushing.',
    ja: '自分だけ取り残されている気がする。どうしても焦ってしまう。' },
  { label: '불안-남걱정', family: '불안',
    ko: '아픈 가족을 생각하면 마음이 놓이지 않는다. 결과가 나올 때까지 계속 그 생각뿐이다.',
    en: 'I cannot stop worrying about someone in my family who is unwell. Until the results come, it is all I think about.',
    ja: '体調の悪い家族のことが気がかりでならない。結果が出るまで、そのことばかり考えてしまう。' },
  { label: '불안-분노', family: '불안',
    ko: '화가 났다. 억울해서 자꾸 그 장면이 떠오른다.',
    en: 'I was angry. It was unfair and the scene keeps replaying.',
    ja: '腹が立った。理不尽で、その場面が何度も浮かぶ。' },

  // 일상
  { label: '일상-관찰', family: '일상',
    ko: '길에서 본 장면 하나가 오래 남았다.',
    en: 'Something I saw on the street stayed with me.',
    ja: '道で見かけた光景が、しばらく頭に残った。' },
  { label: '일상-기록', family: '일상',
    ko: '밥을 먹고 산책을 하고 돌아왔다. 그런 하루였다.',
    en: 'I ate, I walked, I came home. That was the day.',
    ja: 'ご飯を食べて、散歩をして帰ってきた。そんな一日。' },
]

/* ---------------- 상황 — 무엇에 대한 이야기인가 ---------------- */

export const TOPICS: Anchor[] = [
  { label: '일',
    ko: '회사에서 하루를 보냈다. 일이 밀려서 퇴근이 늦었다.',
    en: 'Spent the day at work. Things piled up so I left late.',
    ja: '会社で一日を過ごした。仕事が溜まって帰りが遅くなった。' },
  { label: '학업',
    ko: '시험이 얼마 안 남았다. 책을 펴고 앉아 있었다.',
    en: 'The exam is close. I sat with my books open.',
    ja: '試験が近い。本を開いて座っていた。' },
  { label: '가족',
    ko: '엄마와 통화를 했다. 집 이야기를 한참 들었다.',
    en: 'I called my mum. We talked about home for a while.',
    ja: '母と電話した。家のことをしばらく聞いた。' },
  { label: '연인',
    ko: '그 사람과 오래 이야기했다. 우리 사이가 어떻게 될지 생각했다.',
    en: 'We talked for a long time. I thought about where we are going.',
    ja: '恋人と長く話した。これからのことを考えた。' },
  { label: '친구',
    ko: '친구를 오랜만에 만났다. 밤늦게까지 이야기했다.',
    en: 'Met a friend after a long time. We talked until late.',
    ja: '久しぶりに友だちに会った。夜遅くまで話した。' },
  { label: '집',
    ko: '방을 치우고 빨래를 널었다. 집이 조금 넓어 보였다.',
    en: 'Cleaned my room and hung the laundry. The flat looked bigger.',
    ja: '部屋を片づけて洗濯物を干した。家が少し広く見えた。' },
  { label: '몸',
    ko: '병원에 다녀왔다. 몸이 예전 같지 않다.',
    en: 'Went to the doctor. My body is not what it used to be.',
    ja: '病院に行ってきた。体が前のようにはいかない。' },
  { label: '돈',
    ko: '통장을 확인했다. 이번 달도 빠듯하다.',
    en: 'Checked my balance. Another tight month.',
    ja: '口座を確認した。今月もぎりぎりだ。' },
  { label: '밤',
    ko: '새벽 세 시인데 잠이 오지 않는다. 천장만 보고 있다.',
    en: 'It is three in the morning and I cannot sleep. Just staring at the ceiling.',
    ja: '夜中の三時なのに眠れない。天井を見ているだけ。' },
  { label: '음식',
    ko: '혼자 밥을 먹었다. 커피 한 잔을 오래 들고 있었다.',
    en: 'Ate alone. Held the same cup of coffee for a long time.',
    ja: '一人でご飯を食べた。コーヒーを長いこと持っていた。' },
  { label: '길',
    ko: '지하철을 타고 오는 길이었다. 창밖을 계속 봤다.',
    en: 'On the train home. I kept looking out of the window.',
    ja: '地下鉄で帰る途中だった。ずっと窓の外を見ていた。' },
  { label: '계절',
    ko: '비가 왔다. 공기 냄새가 달라졌다.',
    en: 'It rained. The air smelled different.',
    ja: '雨が降った。空気の匂いが変わった。' },
  { label: '동물',
    ko: '고양이가 옆에 와서 누웠다. 한참 쓰다듬었다.',
    en: 'The cat came and lay down beside me. I stroked her for a while.',
    ja: '猫が隣に来て寝そべった。しばらく撫でていた。' },
  { label: '앞날',
    ko: '앞으로 뭘 하며 살지 생각했다. 아직 정하지 못했다.',
    en: 'Thought about what to do with my life. Still undecided.',
    ja: 'これから何をして生きるか考えた。まだ決められない。' },
]

/** 기준 문장을 (kind, label, family, lang, phrase) 한 줄씩으로 펼칩니다 */
export function allAnchors(): {
  kind: string
  label: string
  family: string | null
  lang: string
  phrase: string
}[] {
  const out = []
  for (const [kind, list] of [['feeling', FEELINGS], ['topic', TOPICS]] as const) {
    for (const a of list) {
      for (const lang of ['ko', 'en', 'ja'] as const) {
        out.push({ kind, label: a.label, family: a.family ?? null, lang, phrase: a[lang] })
      }
    }
  }
  return out
}
