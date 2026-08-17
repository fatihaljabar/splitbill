import type { Lang } from '../../shared/types.ts';

export interface FaqItem {
  q: string;
  a: string;
}

/** Dipakai dua tempat sekaligus: bagian FAQ di beranda, dan JSON-LD FAQPage di index.html.
 * Google mensyaratkan jawaban yang ditandai schema benar-benar tampil di halaman, jadi
 * kalau daftar ini diubah, blok FAQPage di index.html wajib ikut diperbarui. */
const faqId: FaqItem[] = [
  {
    q: 'Apakah SplitBills gratis?',
    a: 'Ya, sepenuhnya gratis. Tidak ada iklan, tidak ada fitur berbayar, dan tidak ada pembelian dalam aplikasi.',
  },
  {
    q: 'Apakah perlu membuat akun?',
    a: 'Tidak. Tidak ada pendaftaran sama sekali — buka situsnya, langsung pakai.',
  },
  {
    q: 'Apakah foto struk saya diunggah ke server?',
    a: 'Tidak pernah. Pembacaan struk berjalan sepenuhnya di peramban Anda, dan fotonya berhenti di perangkat Anda sendiri.',
  },
  {
    q: 'Berapa lama link berbagi berlaku?',
    a: '24 jam. Setelah itu tagihan dihapus otomatis dari server dan link-nya tidak dapat dipakai lagi.',
  },
  {
    q: 'Bisakah teman saya melihat tagihan orang lain?',
    a: 'Pada mode publik, ya. Pada mode privat, tidak — nominal peserta lain tidak pernah dikirimkan ke perangkat mereka, bukan sekadar disembunyikan dari tampilan.',
  },
  {
    q: 'Apakah bisa dipakai di ponsel?',
    a: 'Ya. SplitBills dirancang mobile-first dan berjalan langsung di peramban ponsel tanpa perlu instal aplikasi.',
  },
  {
    q: 'Apakah bisa membaca struk berbahasa Indonesia?',
    a: 'Ya. Mesin pembacanya disetel khusus untuk struk Indonesia memakai model bahasa ind+eng.',
  },
];

const faqEn: FaqItem[] = [
  {
    q: 'Is SplitBills free?',
    a: 'Yes, completely free. No ads, no paid tier, and no in-app purchases.',
  },
  {
    q: 'Do I need an account?',
    a: 'No. There is no sign-up at all — open the site and start using it.',
  },
  {
    q: 'Are my receipt photos uploaded to a server?',
    a: 'Never. Scanning runs entirely in your browser, and the photo stays on your own device.',
  },
  {
    q: 'How long does a share link stay valid?',
    a: '24 hours. After that the bill is deleted from the server automatically and the link stops working.',
  },
  {
    q: 'Can my friends see other people’s amounts?',
    a: 'In public mode, yes. In private mode, no — other participants’ amounts are never sent to their device, not merely hidden in the interface.',
  },
  {
    q: 'Does it work on a phone?',
    a: 'Yes. SplitBills is built mobile-first and runs straight in a phone browser with nothing to install.',
  },
  {
    q: 'Can it read Indonesian receipts?',
    a: 'Yes. The reader is tuned specifically for Indonesian receipts using the ind+eng language model.',
  },
];

export function faqItems(lang: Lang): FaqItem[] {
  return lang === 'id' ? faqId : faqEn;
}
