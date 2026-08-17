import type { Lang } from '../../shared/types.ts';

export interface LegalSection {
  heading: string;
  body: string[];
}

export interface LegalDoc {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}

const LAST_UPDATED_ID = '17 Agustus 2026';
const LAST_UPDATED_EN = '17 August 2026';

const privacyId: LegalDoc = {
  title: 'Kebijakan Privasi',
  updated: LAST_UPDATED_ID,
  intro:
    'SplitBill dibuat supaya bisa dipakai tanpa menyerahkan data pribadi. Halaman ini menjelaskan persis apa yang disimpan, di mana, dan berapa lama.',
  sections: [
    {
      heading: 'Yang tidak kami kumpulkan',
      body: [
        'Tidak ada akun, jadi tidak ada nama pengguna, email, atau kata sandi.',
        'Foto struk tidak pernah diunggah. Pembacaan struk berjalan sepenuhnya di peramban Anda, dan fotonya berhenti di perangkat Anda sendiri.',
        'Tidak ada layanan analitik, kuki pelacak, atau skrip pihak ketiga. Aset pembaca struk pun disajikan dari domain SplitBill sendiri, bukan dari CDN luar.',
      ],
    },
    {
      heading: 'Yang disimpan di server',
      body: [
        'Saat Anda membagikan sebuah tagihan, isinya dikirim ke server supaya penerima link bisa membukanya: nama acara, nama toko, nama peserta, item beserta harganya, pajak dan biaya lain, serta nomor rekening bila Anda mengisinya.',
        'Status pembayaran tiap peserta juga disimpan, supaya pembuat tagihan bisa melihat perubahannya dari perangkat mana pun.',
        'Alamat IP dipakai sementara di memori proses hanya untuk membatasi laju pembuatan tagihan. Tidak ditulis ke basis data dan hilang saat proses dimulai ulang.',
      ],
    },
    {
      heading: 'Yang disimpan di perangkat Anda',
      body: [
        'Riwayat tagihan, draf yang sedang dikerjakan, pilihan bahasa dan tema, serta foto struk disimpan di penyimpanan lokal peramban Anda.',
        'Data ini tidak pernah dikirim ke server dan dapat Anda hapus kapan saja lewat menu riwayat atau dengan membersihkan data situs di peramban.',
      ],
    },
    {
      heading: 'Berapa lama disimpan',
      body: [
        'Tagihan di server dihapus otomatis 24 jam setelah dibuat. Ini tidak dapat diatur, diperpanjang, atau dipulihkan.',
        'Setelah terhapus, link berbagi dan QR Code-nya tidak dapat dipakai lagi, dan datanya tidak dapat dikembalikan oleh siapa pun.',
      ],
    },
    {
      heading: 'Siapa yang bisa melihat tagihan Anda',
      body: [
        'Tidak ada login, jadi siapa pun yang memegang link berbagi dapat membuka tagihan itu selama masih berlaku. Perlakukan link tersebut seperti isi tagihannya sendiri.',
        'Pada mode privat, data peserta lain tidak pernah dikirimkan ke perangkat penerima, bukan sekadar disembunyikan dari tampilan. Link personal per peserta bahkan tidak membawa daftar nama peserta lain sama sekali.',
        'Pada mode publik, semua pemegang link dapat melihat rincian seluruh peserta. Ini memang perilaku yang dipilih saat Anda memilih mode itu.',
      ],
    },
    {
      heading: 'Perubahan kebijakan',
      body: [
        'Bila kebijakan ini berubah, tanggal pembaruan di atas ikut berubah. Karena tidak ada akun, kami tidak dapat memberi tahu Anda secara langsung.',
      ],
    },
  ],
};

const privacyEn: LegalDoc = {
  title: 'Privacy Policy',
  updated: LAST_UPDATED_EN,
  intro:
    'SplitBill is built to be usable without handing over personal data. This page explains exactly what is stored, where, and for how long.',
  sections: [
    {
      heading: 'What we do not collect',
      body: [
        'There are no accounts, so there are no usernames, emails, or passwords.',
        'Receipt photos are never uploaded. Scanning runs entirely in your browser, and the photo stays on your own device.',
        'There is no analytics service, no tracking cookies, and no third-party scripts. Even the OCR assets are served from SplitBill’s own domain rather than an external CDN.',
      ],
    },
    {
      heading: 'What is stored on the server',
      body: [
        'When you share a bill, its contents are sent to the server so that whoever opens the link can see it: event name, store name, participant names, items and their prices, tax and other fees, and the bank account details if you filled them in.',
        'Each participant’s payment status is stored too, so the bill creator can see updates from any device.',
        'IP addresses are held briefly in process memory only to rate-limit bill creation. They are never written to the database and disappear when the process restarts.',
      ],
    },
    {
      heading: 'What is stored on your device',
      body: [
        'Bill history, in-progress drafts, your language and theme preference, and receipt photos are kept in your browser’s local storage.',
        'None of it is sent to the server, and you can remove it at any time from the history menu or by clearing site data in your browser.',
      ],
    },
    {
      heading: 'How long it is kept',
      body: [
        'Bills on the server are deleted automatically 24 hours after they are created. This cannot be configured, extended, or undone.',
        'Once deleted, the share link and its QR code stop working, and the data cannot be recovered by anyone.',
      ],
    },
    {
      heading: 'Who can see your bill',
      body: [
        'There is no login, so anyone holding the share link can open that bill while it is still valid. Treat the link as being as sensitive as the bill itself.',
        'In private mode, other participants’ data is never sent to the recipient’s device rather than merely hidden in the interface. Per-participant personal links do not even carry the list of other participants’ names.',
        'In public mode, everyone with the link can see every participant’s breakdown. That is the intended behaviour of choosing that mode.',
      ],
    },
    {
      heading: 'Changes to this policy',
      body: [
        'If this policy changes, the updated date above changes with it. Because there are no accounts, we cannot notify you directly.',
      ],
    },
  ],
};

const termsId: LegalDoc = {
  title: 'Ketentuan Layanan',
  updated: LAST_UPDATED_ID,
  intro:
    'Dengan memakai SplitBill, Anda menyetujui ketentuan di bawah ini. Ketentuannya sengaja dibuat singkat dan jelas.',
  sections: [
    {
      heading: 'Layanan ini gratis dan apa adanya',
      body: [
        'SplitBill disediakan gratis, tanpa jaminan apa pun, baik tersurat maupun tersirat. Layanan dapat berubah, terganggu, atau dihentikan kapan saja tanpa pemberitahuan.',
        'Kami tidak bertanggung jawab atas kerugian yang timbul dari pemakaian atau ketidaktersediaan layanan ini.',
      ],
    },
    {
      heading: 'Perhitungan adalah alat bantu, bukan penentu',
      body: [
        'Hasil pembacaan struk dan hasil hitung disediakan sebagai alat bantu. Anda tetap bertanggung jawab memeriksa kebenarannya sebelum dipakai untuk menagih siapa pun.',
        'Pembacaan struk otomatis dapat keliru, terutama pada foto yang buram, terpotong, atau bercahaya kurang. Karena itu hasilnya selalu melewati halaman pemeriksaan sebelum masuk ke tagihan.',
      ],
    },
    {
      heading: 'Tidak ada uang yang ditangani',
      body: [
        'SplitBill tidak memproses pembayaran, tidak menyimpan dana, dan tidak terhubung dengan penyedia pembayaran mana pun. Semua transfer dilakukan langsung antar pengguna di luar layanan ini.',
        'Penanda "sudah bayar" bersifat saling percaya. Tidak ada verifikasi transfer, dan siapa pun yang memegang link dapat menandai peserta mana pun sebagai lunas.',
        'Nomor rekening yang Anda masukkan adalah tanggung jawab Anda sendiri, termasuk memastikan nomornya benar sebelum dibagikan.',
      ],
    },
    {
      heading: 'Data terhapus otomatis',
      body: [
        'Tagihan dihapus 24 jam setelah dibuat. Ini perilaku yang disengaja, bukan kegagalan sistem.',
        'Jangan memakai SplitBill sebagai tempat penyimpanan catatan keuangan. Simpan sendiri salinan yang Anda butuhkan sebelum masa berlakunya habis, misalnya lewat tombol unduh gambar atau salin hasil.',
      ],
    },
    {
      heading: 'Pemakaian yang wajar',
      body: [
        'Jangan memakai layanan ini untuk tujuan melanggar hukum, menipu, atau merugikan orang lain.',
        'Jangan mengunggah atau memasukkan data pribadi orang lain tanpa izin mereka.',
        'Ada pembatasan laju pembuatan tagihan per alamat IP untuk menjaga layanan tetap tersedia bagi semua orang.',
      ],
    },
    {
      heading: 'Kode sumber',
      body: [
        'SplitBill bersumber terbuka di bawah Lisensi MIT. Anda bebas memakai, mengubah, dan menyebarkannya, termasuk untuk keperluan komersial, selama pemberitahuan hak cipta tetap disertakan.',
      ],
    },
  ],
};

const termsEn: LegalDoc = {
  title: 'Terms of Service',
  updated: LAST_UPDATED_EN,
  intro: 'By using SplitBill you agree to the terms below. They are deliberately short and plain.',
  sections: [
    {
      heading: 'The service is free and provided as-is',
      body: [
        'SplitBill is provided free of charge, without warranty of any kind, express or implied. The service may change, break, or be discontinued at any time without notice.',
        'We are not liable for any loss arising from using this service or from it being unavailable.',
      ],
    },
    {
      heading: 'Calculations are an aid, not an authority',
      body: [
        'Scan results and calculations are provided as a convenience. You remain responsible for checking them before using them to ask anyone for money.',
        'Automatic receipt reading can be wrong, especially on blurry, cropped, or poorly lit photos. That is why results always pass through a review screen before entering a bill.',
      ],
    },
    {
      heading: 'No money is handled',
      body: [
        'SplitBill does not process payments, hold funds, or connect to any payment provider. All transfers happen directly between users, outside this service.',
        'The "paid" marker is based on mutual trust. There is no transfer verification, and anyone holding the link can mark any participant as paid.',
        'Bank account details you enter are your own responsibility, including making sure the number is correct before sharing it.',
      ],
    },
    {
      heading: 'Data is deleted automatically',
      body: [
        'Bills are deleted 24 hours after creation. This is intended behaviour, not a system failure.',
        'Do not use SplitBill as a place to keep financial records. Save whatever you need before a bill expires, for example with the download-image or copy-result buttons.',
      ],
    },
    {
      heading: 'Acceptable use',
      body: [
        'Do not use this service for unlawful, fraudulent, or harmful purposes.',
        'Do not upload or enter other people’s personal data without their permission.',
        'Bill creation is rate-limited per IP address to keep the service available to everyone.',
      ],
    },
    {
      heading: 'Source code',
      body: [
        'SplitBill is open source under the MIT License. You are free to use, modify, and distribute it, including commercially, as long as the copyright notice is kept.',
      ],
    },
  ],
};

export function privacyDoc(lang: Lang): LegalDoc {
  return lang === 'id' ? privacyId : privacyEn;
}

export function termsDoc(lang: Lang): LegalDoc {
  return lang === 'id' ? termsId : termsEn;
}
