/**
 * 第一法務事務所 スタッフアカウントの投入（全員 ADMIN）。
 *   pnpm auth:seed-staff
 * パスワード平文は含めない（scrypt ハッシュのみ）。配布用の平文は別ファイル参照。
 * 既存IDは name/role/passwordHash を更新（upsert）。
 */
import { config as loadDotenv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') })

const { prisma } = await import('../src/server/db')

const staff: { email: string; name: string; passwordHash: string }[] = [
  { email: 'nakagawa.teruyuki', name: '中川　晃行', passwordHash: 'scrypt$20d02661d115498bb2008043649a099e$6aca066667131051e505c2e42639f55ad8a8158386bb1a36a5e4ad70a79ae6132cca6f95e6b17fa25a7c564412b37b923ac4b278e2bce939781d39c459fecce4' },
  { email: 'dobashi.mitsuru', name: '土橋　満', passwordHash: 'scrypt$0a12d05e41d70f998f3604825fce341f$4b21d86bca1c65360416bbd6f0b36e6496a2362adc331f6a917bbd50985462b3c9f183bd3a50b8e39cb2c5951fb25d8e998ecb0a314708942ad36c321cb1c2c1' },
  { email: 'mitamura.ryuta', name: '三田村　竜太', passwordHash: 'scrypt$6abb205a09238a8d98e89b3d4cbc0d79$df334406ae9ec22bacfe397dcd98ea4aceea22f1320c739f563a69a0ef7d0b519390c28235ab15602a995e343f34bce6d2eccd911f6653624895026a9c07e709' },
  { email: 'mori.takeshi', name: '森　武', passwordHash: 'scrypt$700a4269adc0932ba957e57ab6df6c7c$8d0ceabdf1655be7074a094dfda151d02de55998048e23680ea02cfc2bdcbd0124e079c3f00fd3953d3978ca55636c468530e03bc4d5d3246f93abb349495d61' },
  { email: 'taketani.kano', name: '竹谷　香乃', passwordHash: 'scrypt$2b9a75aee32b1ac75acd67457ff93f4f$16e41035fcddadf4ebaf69ad3cf9b123b99286a38e21c8855955a2e2cacb4857b1fd35294bc188a2318f1e4cc5f78ed338d66ca19a6a3f1f8e658b02d10e72b2' },
  { email: 'akamatsu.ruka', name: '赤松　瑠果', passwordHash: 'scrypt$d290f90790466407d9172fc37439fafb$34cf50ce50ac23715355590276fe1f904a96e8cb5476d997bae90e073dd22ce50f527e6d71c35fcfd4b00a683a8bb87da327850ae885007b4c338661947c4ba4' },
  { email: 'miyagawa.ayana', name: '宮川　綾奈', passwordHash: 'scrypt$2c4b237f2e33e7d1bf5a68809487a5f4$ab1d90f4d8bae5407dba5c4d8d8b88ab56a9b41719c51d4821804e2bfb2fa2c2e1b1a2753b28151a3f12f374343bff77eaf0ebf75739c9a715b5d3c6ead05ad3' },
  { email: 'horimoto.kazuyo', name: '堀本　和代', passwordHash: 'scrypt$11dac6e8202e879819bd55a959c6ef9f$7f38c21c74f936592fbb68d820caac36126f2d37e73fc831f7452f1ba4418fd83621c6dc4cbf3b53d095a77361d3547b61d8cc1ba1ecd82508fc49de1249684b' },
  { email: 'fujikawa.takumi', name: '藤川　拓己', passwordHash: 'scrypt$5c1fb1fbfc03466c32e357dc38c74b7c$7f36b1043ebc9220cc88cd3fc9591cd3b54f163b1bc1f7ef316c362675ac411d9b0c655fe28fbd1a9915b379754b2029dd31d213217e33b8890568a6a980f691' },
  { email: 'fujiwara.eri', name: '藤原　恵利', passwordHash: 'scrypt$83128dc99abf8949b924128d6d2a1c76$9c9c1054dcb60e22e4db586babc00346a5b68855ae2b8b6b879214f18ff090d957e0ceea55beeeabb5c94f31d284437843659720d8ae6743a87c46a54f515205' },
  { email: 'miyatake.ami', name: '宮武　愛海', passwordHash: 'scrypt$8237a2fea81190527d02ef5dafd91654$542f5cf12e1cb23de66ec3c24276fb63e1fb99ea1a82718524a27e1a0431850c71b8ddd962e6ec9e6dcce046de78ef9c816374c751e514e749ad0f60b778cb46' },
  { email: 'ishihara.asahi', name: '石原　暉', passwordHash: 'scrypt$c95af89c2e4aaa3950eee449bfb7752c$7e70c0e2b7b49865274640dcf1547f5199c54977cdef83be68cda9c2667bb187734b539797936eccb974c2fb6d1e3048e091d107c47e14a0555e75dbe6d7d08f' },
  { email: 'otaki.eiichi', name: '大瀧　瑛一', passwordHash: 'scrypt$5d540d8dcea9c954c657dc292ef40c6c$5d408ad0ef5a297da507097b746152d56f38ae8c7f155eaa58711a6855d53780ddcfaed056439380d686215cd165c9dafa578520e1bc79fa01e0d773aa6fe15d' },
  // 髙士　友希（takashi.yuki）は退職済のため対象外（DB上は status=DISABLED でログイン不可）。
  // 再シードで再有効化しないよう、ここではコメントアウトして保持する。
  // { email: 'takashi.yuki', name: '髙士　友希', passwordHash: 'scrypt$1b34b55c18f592e9dcd69df3d59e5543$a36094537fc492327a16cad6801d0ad5c5862919dd841438b0650912dcbf0c3796f2451d926b149bb85d2e44890a30ad86675521b308266af06253ff772e9971' },
  { email: 'tanaka.shungo', name: '田中　俊吾', passwordHash: 'scrypt$ed012bc47204472dec33e6db41cd2c41$81f292483466553677028fab61b7736da5da21c987ebdfc41e94a15770b4636108fd314df956b1eeeb4e973b81c85af48154d609a74aab5dad5d5edd45c2a530' },
]

for (const s of staff) {
  await prisma.user.upsert({
    where: { email: s.email },
    create: { email: s.email, name: s.name, role: 'ADMIN', status: 'ACTIVE', passwordHash: s.passwordHash },
    update: { name: s.name, role: 'ADMIN', status: 'ACTIVE', passwordHash: s.passwordHash },
  })
  console.log('upserted:', s.email)
}
console.log('done:', staff.length, 'users')
await prisma.$disconnect()
