import { AnimatePresence, motion } from 'framer-motion'
import type { VocabTab } from '../../lib/types'
import { useStore } from '../../store/useStore'
import { Segmented } from '../ui'
import { Flashcards } from './Flashcards'
import { Quiz } from './Quiz'
import { SpellingDrill } from './SpellingDrill'
import { DeckBrowser } from './DeckBrowser'
import { VocabList } from './VocabList'

export function VocabView() {
  const tab = useStore((s) => s.vocabTab)
  const setTab = useStore((s) => s.setVocabTab)
  const count = useStore((s) => s.vocab.length)

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <aside className="lg:pt-1">
          <h2 className="text-2xl font-semibold tracking-tight">Sổ từ</h2>
          <p className="mt-1 text-sm leading-relaxed text-chu-mo">
            {count === 0 ? 'Mọi từ bạn lưu từ phụ đề nằm ở đây.' : `${count} từ, mỗi từ đều gắn với câu và video gốc.`}
          </p>
          <div className="mt-4 -mx-4 overflow-x-auto px-4 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
            <Segmented<VocabTab>
              size="sm"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'list', label: 'Danh sách' },
                { value: 'flashcards', label: 'Thẻ lật' },
                { value: 'spelling', label: 'Chép từ' },
                { value: 'quiz', label: 'Trắc nghiệm' },
                { value: 'decks', label: 'Bộ từ' },
              ]}
              className="[&>button]:shrink-0"
            />
          </div>
          <nav className="mt-5 hidden flex-col gap-0.5 lg:flex">
            <SideItem active={tab === 'list'} onClick={() => setTab('list')} label="Danh sách" hint="Tìm, nghe, xoá, xuất CSV" />
            <SideItem active={tab === 'flashcards'} onClick={() => setTab('flashcards')} label="Thẻ lật" hint="Ôn theo lịch giãn cách" />
            <SideItem active={tab === 'spelling'} onClick={() => setTab('spelling')} label="Chép từ" hint="Nghe rồi gõ đúng chính tả" />
            <SideItem active={tab === 'quiz'} onClick={() => setTab('quiz')} label="Trắc nghiệm" hint="Từ ↔ nghĩa, 4 đáp án" />
            <SideItem active={tab === 'decks'} onClick={() => setTab('decks')} label="Bộ từ" hint="TOEIC, tiếng Anh thương mại, HSK 1–4" />
          </nav>
        </aside>

        <section className="min-w-0">
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
              {tab === 'list' && <VocabList />}
              {tab === 'flashcards' && <Flashcards />}
              {tab === 'spelling' && <SpellingDrill />}
              {tab === 'quiz' && <Quiz />}
              {tab === 'decks' && <DeckBrowser />}
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
    </div>
  )
}

function SideItem({ active, onClick, label, hint }: { active: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button
      onClick={onClick}
      className={`press relative flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${active ? 'bg-mat-chim text-chu' : 'text-chu-mo hover:bg-mat hover:text-chu'}`}
    >
      {active && <motion.span layoutId="vocab-side" className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full bg-nhan" />}
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-chu-mo-hon">{hint}</span>
      </span>
    </button>
  )
}
