/**
 * 잔별의 의미 읽기 — Gemini 임베딩
 * ---------------------------------------------------------------
 * 글 한 편을 Gemini(gemini-embedding-001)에 보내 '의미'를 768개의 숫자로 받아
 * star_embeddings 에 저장합니다. 이 숫자끼리 가까우면 마음이 닮은 글이에요.
 * (단어가 하나도 겹치지 않아도 — "씁쓸했다"와 "마음이 좀 그랬다"를 가깝게 봅니다)
 *
 * 2026-11부터 여기서 두 가지를 더 합니다.
 *   · **감정**  — 의미가 어느 기준 문장에 가장 가까운지로 정합니다.
 *                 한국어 정규식 사전이 하던 일을 대신해요. 그래서 영어로 쓰든
 *                 일본어로 쓰든 같은 마음이면 같은 색 별이 됩니다.
 *   · **언어**  — 글자 모양으로 봅니다 (한글/가나/한자/키릴/그 외).
 *                 번역 버튼을 보여줄지 말지를 정하는 데만 씁니다.
 *
 * 부르는 법
 *   { star_id: "..." }  → 그 별 하나 (이미 있으면 건너뜀)
 *   {}                  → 아직 의미를 안 읽은 별을 최근 것부터 최대 40개
 *   { redo: true }      → 이미 읽은 별도 감정만 다시 매깁니다 (임베딩은 그대로 씀)
 *
 * 필요한 비밀값 (대시보드 → Edge Functions → Secrets)
 *   GEMINI_API_KEY         — Google AI Studio 에서 만든 잔별 키 (결제가 켜진 프로젝트)
 *   JANBYEOL_SERVICE_KEY   — delete-account 와 같은 관리자 키
 *
 * 먼저 실행해 두셔야 하는 것: supabase/semantic-match.sql, supabase/multilingual.sql
 *
 * 배포
 *   supabase functions deploy embed-star
 *   또는 대시보드 → Edge Functions → embed-star → Code 에 붙여넣고 Deploy updates
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
/* ─────────────────────────────────────────────────────────────
   기준 문장 — 원래 anchors.ts 로 나눠 두었던 것을 한 파일에 담았습니다.
   ───────────────────────────────────────────────────────────── */

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

type Anchor = { label: string; family?: string; ko: string; en: string; ja: string }

/* ---------------- 마음 — 여덟 갈래, 스물여섯 결 ---------------- */

const FEELINGS: Anchor[] = [
  // 기쁨
  /* 처음엔 '오늘은 참 좋았다'로 썼습니다. 그런데 '좋다'는 한국어에서 너무
     흔한 말이라 주변을 통째로 빨아들였어요 — 평온한 글도, 돌아가신 아버지를
     떠올리는 글도 전부 기쁨이 됐습니다. 그래서 **들뜬 기분 쪽으로** 좁힙니다. */
  { label: '기쁨-좋음', family: '기쁨',
    ko: '오늘 하루가 즐거웠다. 돌아오는 길에도 자꾸 웃음이 났다.',
    en: 'Today was fun. I kept smiling even on the way home.',
    ja: '今日は楽しかった。帰り道でも何度も笑ってしまった。' },
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
  { label: '그리움-떠난이', family: '그리움',
    ko: '돌아가신 분이 꿈에 나왔다. 아직 거기 계신 것만 같다.',
    en: 'Someone I lost appeared in my dream. It still feels like they are here.',
    ja: '亡くなった人が夢に出てきた。まだそこにいるような気がする。' },
  { label: '그리움-시절', family: '그리움',
    ko: '그때가 자꾸 떠오른다. 다시 돌아갈 수는 없겠지.',
    en: 'I keep remembering how things used to be. There is no going back.',
    ja: 'あの頃が何度も浮かぶ。もう戻れないのだろう。' },
  { label: '그리움-장소', family: '그리움',
    ko: '예전에 살던 동네를 지나왔다. 골목이 그대로였다.',
    en: 'I walked past the neighbourhood where I used to live. The alley had not changed.',
    ja: '昔住んでいた町を通った。路地はそのままだった。' },

  // 슬픔
  /* 쪼개면서 정작 **그냥 슬픈 글**이 갈 곳을 없앴습니다. '눈물이 났다'는
     이별도 상실도 자책도 아닌, 그냥 슬픔이에요. 갈래마다 이렇게 뭉뚱그린
     자리가 하나씩은 있어야 합니다 — 사람의 마음이 늘 이름을 갖고 오지는
     않으니까요. */
  { label: '슬픔-먹먹', family: '슬픔',
    ko: '눈물이 났다. 이유는 모르겠고 그냥 마음이 먹먹하다.',
    en: 'I cried. I do not know why, my chest just feels heavy.',
    ja: '涙が出た。理由は分からない。ただ胸が重い。' },
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
  { label: '불안-손실', family: '불안',
    ko: '손해를 봤다. 숫자가 자꾸 눈앞에 어른거린다.',
    en: 'I lost money. The numbers keep floating in front of my eyes.',
    ja: '損をした。数字が何度も目の前にちらつく。' },
  { label: '불안-분노', family: '불안',
    ko: '화가 났다. 억울해서 자꾸 그 장면이 떠오른다.',
    en: 'I was angry. It was unfair and the scene keeps replaying.',
    ja: '腹が立った。理不尽で、その場面が何度も浮かぶ。' },

  /* 일상.
     처음엔 둘뿐이었습니다. 슬픔은 여섯, 불안은 다섯인데 일상만 둘이었어요.
     그래서 **평범한 글이 내려앉을 자리가 부족했습니다.** 책을 읽는 이야기,
     뉴스를 보며 드는 생각, 혼잣말 같은 질문 — 이런 글들이 갈 곳이 없어
     그리움이나 불안으로 끌려갔습니다. 하늘의 대부분은 특별한 마음이 아니라
     그냥 하루입니다. 그 자리를 넓게 둬야 나머지가 제자리를 지킵니다. */
  { label: '일상-관찰', family: '일상',
    ko: '길에서 본 장면 하나가 오래 남았다.',
    en: 'Something I saw on the street stayed with me.',
    ja: '道で見かけた光景が、しばらく頭に残った。' },
  { label: '일상-기록', family: '일상',
    ko: '밥을 먹고 산책을 하고 돌아왔다. 그런 하루였다.',
    en: 'I ate, I walked, I came home. That was the day.',
    ja: 'ご飯を食べて、散歩をして帰ってきた。そんな一日。' },
  { label: '일상-읽기', family: '일상',
    ko: '요즘 책을 한 권 읽고 있다. 어디까지 읽었는지 적어둔다.',
    en: 'I am reading a book these days. Writing down where I left off.',
    ja: '最近、本を一冊読んでいる。どこまで読んだか書いておく。' },
  { label: '일상-소식', family: '일상',
    ko: '뉴스에서 그런 이야기를 봤다. 세상이 그렇게 돌아가는 모양이다.',
    en: 'Saw that story in the news. So that is how the world is going.',
    ja: 'ニュースでそんな話を見た。世の中はそういうふうに動いているらしい。' },
  { label: '일상-혼잣말', family: '일상',
    ko: '이게 맞나? 잘 모르겠다. 그냥 적어둔다.',
    en: 'Is this right? I am not sure. Just writing it down.',
    ja: 'これで合っているのかな。よく分からない。とりあえず書いておく。' },
]

/* ---------------- 상황 — 무엇에 대한 이야기인가 ---------------- */

const TOPICS: Anchor[] = [
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
function allAnchors(): {
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

/* ───────────── 여기까지 기준 문장 ───────────── */


const MODEL = 'gemini-embedding-001'
const DIM = 768
const BACKFILL_MAX = 40

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

/**
 * 이 프로젝트의 관리자 키들.
 *
 * 처음엔 **하나만** 집었습니다. 그게 잘못이었어요. 프로젝트에는 secret 키가
 * 여럿 있을 수 있고(키를 갈아끼우는 동안엔 반드시 그렇습니다), 저는 맨 앞의
 * 하나만 보고 "이것만 관리자 키"라고 못 박았습니다. 그래서 다른 쪽 키를
 * 들고 오면 주인인데도 문전박대를 당했습니다.
 *
 * 이제 **찾을 수 있는 모든 키를 모아** 그중 하나와 맞으면 주인으로 봅니다.
 * 전부 이 프로젝트의 관리자 키이니 어느 쪽이든 권한은 같아요.
 */
function adminKeys(): { keys: string[]; primary: string | null; sources: string[] } {
  const keys: string[] = []
  const sources: string[] = []
  const add = (v: unknown, from: string) => {
    if (typeof v === 'string' && v && !keys.includes(v)) {
      keys.push(v)
      sources.push(from)
    }
  }

  add(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), 'SERVICE_ROLE_KEY')

  const bundle = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (bundle) {
    try {
      const parsed = JSON.parse(bundle)
      const items = Array.isArray(parsed) ? parsed : Object.values(parsed)
      for (const it of items) {
        if (typeof it === 'string') add(it, 'SECRET_KEYS')
        else if (it && typeof it === 'object') {
          const v = it as Record<string, unknown>
          add(v.api_key ?? v.key ?? v.secret, 'SECRET_KEYS')
        }
      }
    } catch {
      /* 모양이 다르면 그냥 건너뜁니다 */
    }
  }

  add(Deno.env.get('JANBYEOL_SERVICE_KEY'), 'JANBYEOL_SERVICE_KEY')
  return { keys, primary: keys[0] ?? null, sources }
}

/**
 * 키의 지문 — 값은 숨기고 같은지 다른지만 보여줍니다.
 *
 * 키가 안 맞을 때 "안 맞는다"는 말만 돌려주면 고칠 길이 없습니다. 그렇다고
 * 키를 보여줄 수는 없고요. 그래서 **되돌릴 수 없는 지문** 여덟 글자만 보냅니다.
 */
async function fingerprint(v: string | null): Promise<string> {
  if (!v) return '(없음)'
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}·${v.length}자`
}

/**
 * 무슨 글자로 쓰였는가.
 *
 * 번역기를 부르지 않고 글자 모양만 셉니다. 공짜이고 빠르고, 우리가 필요한
 * 정확도(번역 버튼을 띄울까 말까)에는 충분합니다.
 * 한글이 섞여 있으면 한국어, 가나가 있으면 일본어 — 섞어 쓰는 글을 위해
 * 비율이 아니라 **있는지 없는지**로 봅니다.
 */
function langOf(text: string): string {
  if (/[가-힣ᄀ-ᇿ]/.test(text)) return 'ko'
  if (/[぀-ゟ゠-ヿ]/.test(text)) return 'ja'
  if (/[一-鿿]/.test(text)) return 'zh'
  if (/[Ѐ-ӿ]/.test(text)) return 'ru'
  if (/[฀-๿]/.test(text)) return 'th'
  if (/[؀-ۿ]/.test(text)) return 'ar'
  return 'en'
}

/** 글 → 의미(768개 숫자). 768로 줄인 값은 길이를 1로 맞춰야 한다고 Gemini 문서에 적혀 있어요 */
async function embed(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        model: `models/${MODEL}`,
        content: { parts: [{ text: text.slice(0, 4000) }] },
        taskType: 'SEMANTIC_SIMILARITY',
        outputDimensionality: DIM,
      }),
    }
  )
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  const values: number[] = data?.embedding?.values ?? data?.embeddings?.[0]?.values
  if (!Array.isArray(values) || values.length !== DIM) throw new Error('Gemini 응답 모양이 예상과 달라요')
  const norm = Math.hypot(...values) || 1
  return values.map((v) => v / norm)
}

/**
 * 기준 문장 채우기 — **끊어서** 채웁니다.
 *
 * 문장이 120개입니다. 한 번에 다 부르면 Gemini 왕복만 120번이라 함수가
 * 시간 안에 못 끝내고 끊겨요. 그러면 반쯤 채워진 채로 남는데, 그 상태가
 * 가장 나쁩니다 — 반쪽짜리 자로 잰 마음은 틀린 마음이니까요.
 *
 * 그래서 **아직 없는 것만, 한 번에 budget 개씩** 채우고 몇 개 남았는지
 * 돌려줍니다. 0이 될 때까지 몇 번 더 부르면 됩니다.
 * 다 차면 언어의 그림자(lang_centroids)를 다시 계산합니다.
 */
async function fillAnchors(
  admin: ReturnType<typeof createClient>,
  apiKey: string,
  budget = 30
): Promise<{ filled: number; remaining: number; centroids?: number }> {
  const want = allAnchors()
  const { data: have } = await admin.from('meaning_anchors').select('kind, label, lang')
  const seen = new Set((have ?? []).map((r: Record<string, string>) => `${r.kind}|${r.label}|${r.lang}`))
  const todo = want.filter((a) => !seen.has(`${a.kind}|${a.label}|${a.lang}`))

  let filled = 0
  for (const a of todo.slice(0, budget)) {
    try {
      const vec = await embed(a.phrase, apiKey)
      const { error } = await admin.from('meaning_anchors').upsert({
        kind: a.kind,
        label: a.label,
        family: a.family,
        lang: a.lang,
        phrase: a.phrase,
        embedding: JSON.stringify(vec),
      })
      if (error) throw new Error(error.message)
      filled++
    } catch (err) {
      console.error('[잔별] 기준 문장을 못 담았어요', a.label, a.lang, String(err).slice(0, 200))
      break // 한 번 막히면 (대개 할당량) 남은 것도 막힙니다. 다음 호출에서 이어가요.
    }
  }

  const remaining = todo.length - filled
  if (remaining > 0) return { filled, remaining }

  // 다 찼습니다 — 언어마다의 평균 방향을 다시 구합니다
  const { data: n } = await admin.rpc('rebuild_lang_centroids')
  return { filled, remaining: 0, centroids: (n as number) ?? 0 }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ error: '로그인이 필요합니다' }, 401)
  const token = auth.replace(/^Bearer\s+/i, '').trim()

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  const { keys, primary: key, sources } = adminKeys()
  if (!apiKey || !key) {
    console.error('[잔별] GEMINI_API_KEY 또는 관리자 키가 비어 있습니다 (Edge Functions → Secrets)')
    return json({ error: 'not configured' }, 500)
  }
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false } })

  let body: { star_id?: string; redo?: boolean; anchors?: boolean; budget?: number } = {}
  try {
    body = await req.json()
  } catch {
    /* 빈 요청 = 채우기 */
  }

  /**
   * 누가 부르는가.
   *
   * 예전엔 Authorization 헤더가 **있기만 하면** 통과시켰습니다. 그건 자물쇠가
   * 아니라 문고리였어요 — 주소만 알면 아무 글자나 적어 넣고 Gemini 를 대신
   * 불러 쓸 수 있었습니다. 그 비용은 전부 저희 몫이고요.
   *
   * 이제 두 종류만 들어옵니다.
   *   · 별 하나 읽기(star_id) — 로그인한 사람이면 누구나. 익명 계정도 사람입니다.
   *     남의 별도 읽게 둡니다. 곁의 별을 찾으려면 그 별의 의미가 필요하고,
   *     한 별은 **평생 한 번만** 읽으니 부풀 일이 없습니다.
   *   · 통째로 다시 매기기(redo) / 빈 요청으로 밀어 넣기 — 관리자 키로만.
   *     하늘 전체를 훑는 일이라 사람 손에 쥐여줄 문이 아닙니다.
   */
  const isOwner = keys.includes(token) // 이 프로젝트의 관리자 키 중 **아무거나** 맞으면 주인입니다
  const wholeSky = Boolean(body.redo) || Boolean(body.anchors) || !body.star_id
  if (wholeSky) {
    if (!isOwner) {
      // 키가 안 맞을 때, 무엇과 안 맞는지를 알려줍니다 (값이 아니라 지문으로)
      return json({
        error: '관리자 키로만 할 수 있습니다',
        함수가_아는_키: await Promise.all(keys.map(fingerprint)),
        보내신_키: await fingerprint(token),
        어디서_가져왔나: sources,
      }, 403)
    }
  } else if (!isOwner) {
    const { data: who } = await admin.auth.getUser(token)
    if (!who?.user) return json({ error: '누구인지 확인할 수 없습니다' }, 401)
  }

  // ── 기준 문장 채우기 — 관리자가 직접 부릅니다 ──
  // 예전엔 모든 요청마다 "비었나?"를 물었습니다. 별 하나 읽을 때마다 쓸데없는
  // 왕복이 한 번씩 더 생기는 거예요. 채우는 건 처음 몇 번뿐인 일이니 따로 뺍니다.
  if (body.anchors) {
    try {
      const r = await fillAnchors(admin, apiKey, Math.min(60, Math.max(5, body.budget ?? 30)))
      return json({ ok: true, ...r })
    } catch (err) {
      console.error('[잔별] 기준 문장을 못 만들었습니다', String(err).slice(0, 300))
      return json({ error: '기준 문장을 채우지 못했어요' }, 502)
    }
  }

  /**
   * 이 글의 마음과 상황을 정해 별에 적어둡니다.
   *
   *   emotion  여덟 갈래 — 별의 색과 자리가 이걸 씁니다
   *   feeling  스물여섯 결 — 곁에 둘지 말지를 정할 때 씁니다
   *   topic    무엇에 대한 이야기인가
   *   lang     무슨 말로 썼나 (번역 버튼과 '언어의 그림자'에 씁니다)
   *
   * 언어를 먼저 정해서 넘깁니다. 서버가 그 언어의 평균 방향을 빼고 재야
   * '같은 한국어라서 가깝다'가 사라지니까요.
   */
  const label = async (starId: string, text: string, vecJson: string) => {
    const lang = langOf(text)

    /* 너무 짧은 글에서는 마음을 읽지 않습니다.
       `네 있었어요` 두 어절에 그리움을 붙이고 `배가고프다`에 기쁨을 붙이는 건
       읽은 게 아니라 찍은 겁니다. 짧은 글의 임베딩은 거의 소음이라, 자를
       들이대면 눈금은 늘 하나를 가리키지만 그 가리킴에 뜻이 없어요.
       글자(공백·기호 제외)로 세어 열두 자 미만이면 흰 별로 둡니다. */
    const letters = (text || '').replace(/[\s\p{P}\p{S}]/gu, '').length
    if (letters < 12) {
      await admin.from('stars').update({ emotion: null, feeling: null, topic: null, lang }).eq('id', starId)
      return { emotion: null, feeling: null, topic: null, lang }
    }

    const { data } = await admin.rpc('meaning_for', { p_embedding: vecJson, p_lang: lang })
    const m = (data ?? {}) as { feeling?: string | null; family?: string | null; topic?: string | null }
    await admin
      .from('stars')
      .update({
        emotion: m.family ?? null,
        feeling: m.feeling ?? null,
        topic: m.topic ?? null,
        lang,
      })
      .eq('id', starId)
    return { emotion: m.family ?? null, feeling: m.feeling ?? null, topic: m.topic ?? null, lang }
  }

  // ── 이미 의미를 읽은 별들의 감정만 다시 매기기 ──
  if (body.redo) {
    const { data: rows } = await admin
      .from('star_embeddings')
      .select('star_id, embedding, stars!inner(text)')
      .limit(BACKFILL_MAX * 5)

    let relabeled = 0
    for (const r of (rows || []) as { star_id: string; embedding: unknown; stars: { text: string } }[]) {
      try {
        const vecJson = typeof r.embedding === 'string' ? r.embedding : JSON.stringify(r.embedding)
        await label(r.star_id, r.stars?.text || '', vecJson)
        relabeled++
      } catch (err) {
        console.error('[잔별] 감정을 다시 매기지 못했어요', r.star_id, String(err).slice(0, 200))
      }
    }
    return json({ ok: true, relabeled })
  }

  // ── 의미를 아직 안 읽은 별 ──
  let targets: { id: string; text: string }[] = []
  let pendingTotal = 0
  if (body.star_id) {
    const { data: done } = await admin.from('star_embeddings').select('star_id').eq('star_id', body.star_id).maybeSingle()
    if (done) return json({ ok: true, skipped: 1 })
    const { data: star } = await admin.from('stars').select('id, text').eq('id', body.star_id).maybeSingle()
    if (!star) return json({ error: 'not found' }, 404)
    targets = [star as { id: string; text: string }]
  } else {
    const [{ data: stars }, { data: done }] = await Promise.all([
      admin.from('stars').select('id, text').order('created_at', { ascending: false }).limit(2000),
      admin.from('star_embeddings').select('star_id').limit(100000),
    ])
    const have = new Set((done || []).map((r: { star_id: string }) => r.star_id))
    const pending = ((stars || []) as { id: string; text: string }[]).filter((s) => !have.has(s.id))
    pendingTotal = pending.length
    targets = pending.slice(0, BACKFILL_MAX)
  }

  let saved = 0
  // 별 하나만 부탁받았을 때는 결과를 돌려줍니다 — 부른 화면이 바로 색을 칠할 수 있게
  let labelled: { emotion: string | null; feeling: string | null; topic: string | null; lang: string } | null = null
  const errors: string[] = []
  for (const s of targets) {
    if (!s.text?.trim()) continue
    try {
      const vec = await embed(s.text, apiKey)
      const vecJson = JSON.stringify(vec)
      const { error } = await admin
        .from('star_embeddings')
        .upsert({ star_id: s.id, embedding: vecJson, model: MODEL })
      if (error) throw error
      labelled = await label(s.id, s.text, vecJson)
      saved++
    } catch (err) {
      errors.push(String(err).slice(0, 200))
      if (errors.length >= 3) break // 키나 요금 문제면 더 부르지 않습니다
    }
  }
  if (errors.length) console.error('[잔별] 의미를 읽지 못한 별이 있어요', errors)
  return json({
    ok: errors.length === 0,
    saved,
    remaining: body.star_id ? 0 : Math.max(0, pendingTotal - saved),
    emotion: body.star_id ? labelled?.emotion ?? null : undefined,
    feeling: body.star_id ? labelled?.feeling ?? null : undefined,
    topic: body.star_id ? labelled?.topic ?? null : undefined,
    lang: body.star_id ? labelled?.lang ?? null : undefined,
    errors,
  })
})
