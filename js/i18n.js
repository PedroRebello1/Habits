// i18n.js — every string the app shows, in English and Brazilian Portuguese,
// plus the date formatting that differs between them.
//
// Keys are flat and namespaced by screen. Plural forms are one string split on
// a pipe: "{n} day|{n} days". Both languages take the same rule (one vs other),
// which is why one helper covers them.
//
// dates.js stays pure arithmetic and knows nothing about language; the naming
// and formatting of a date lives here.

import { dayOf, monthOf, yearOf, parseKey } from './dates.js';

export const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'pt-BR', label: 'Português (Brasil)' },
];

const EN = {
  'app.name': 'Habit Grid',
  'app.tagline': 'A decade of small marks, and nothing else. No accounts, no reminders, no server.',

  'n.day': '{n} day|{n} days',
  'n.tick': '{n} tick|{n} ticks',
  'n.habit': '{n} habit|{n} habits',
  'n.completedDay': '{n} completed day|{n} completed days',
  'n.entry': '{n} entry|{n} entries',

  'common.done': 'done',
  'common.notDone': 'not done',
  'common.ofDone': '{n} of {t} done',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.dismiss': 'Dismiss',
  'common.undo': 'Undo',
  'common.today': 'Today',
  'common.back': 'Back',
  'common.settings': 'Settings',
  'common.reset': 'Reset',
  'common.restore': 'Restore',
  'common.ofDays': '{done} of {days} days',
  'common.less': 'Less',
  'common.more': 'More',

  'onboard.question': 'What should the app call you?',
  'onboard.namePlaceholder': 'Your name',
  'onboard.privacy': 'Everything you record lives in this browser on this device, and nowhere else. There is no account to lose and no server to leak it. That also means it is yours to look after: export a copy now and then.',
  'onboard.install': 'Add to Home screen',
  'onboard.installWhy': 'Installing keeps the app offline and stops the browser clearing your data after a spell without a visit. Worth the ten seconds.',
  'onboard.start': 'Start',
  'onboard.hasExport': 'Already have an export? Start, then use Settings → Import.',
  'onboard.installManual': 'Open your browser menu and choose "Add to Home screen".',

  'home.greeting': 'Hello, {name}',
  'home.empty': 'Nothing yet',
  'home.emptyBody': 'Add a habit and start filling the grid. One square a day.',
  'home.addHabit': 'Add a habit',
  'home.view': 'View',
  'home.grid': 'Grid',
  'home.week': 'Week',
  'home.todayAria': 'Today, {name} — {status}. Tap to tick.',
  'home.noStreak': 'No streak · {total} total',
  'home.notStarted': 'Not started',
  'home.perDay': '{n}× daily',

  'nudge.never': 'You have never exported a copy of this.',
  'nudge.stale': 'Last export was {ago} ago.',
  'nudge.action': 'Export',
  'nudge.dismiss': 'Dismiss for a week',

  'week.title': 'Last 7 days',
  'week.empty': 'Add a habit to see the week.',
  'week.cellAria': '{name}, {date} — {status}',

  'cal.settings': 'Habit settings',
  'cal.prev': 'Previous month',
  'cal.next': 'Next month',
  'cal.oncePerDay': 'Once a day',
  'cal.ticksPerDay': '{n} ticks a day',
  'cal.started': 'Started {date}.',
  'cal.monthAria': '{name}, {month}',

  'stat.current': 'Current streak',
  'stat.longest': 'Longest streak',
  'stat.completed': 'Days completed',
  'stat.rate': 'Completion rate',
  'stat.ticks': 'Total ticks',
  'stat.tracked': 'Days tracked',
  'stat.lastTick': 'Since last tick',
  'stat.lastTickNever': 'Never',
  'stat.lastTickToday': 'Today',
  'stat.recent': 'Last {n} days',
  'stat.bestDay': 'Best weekday',
  'stat.unit.days': 'days',
  'stat.unit.day': 'day',

  'zoom.tapADay': 'Tap a day to tick it.',
  'zoom.weekOf': 'Week of {date}',

  'del.title': 'Delete {name}?',
  'del.body': 'This removes {days} and {ticks}. You get ten seconds to undo, then it is gone.',
  'del.keep': 'Keep it',
  'del.done': 'Deleted {name}.',
  'del.undone': '{name} is back.',

  'notFound.title': 'Not found',
  'notFound.head': 'That habit is gone',
  'notFound.body': 'It may have been deleted on another tab.',

  'edit.new': 'New habit',
  'edit.edit': 'Edit habit',
  'edit.name': 'Name',
  'edit.namePlaceholder': 'Read, Run, Water…',
  'edit.untitled': 'Untitled',
  'edit.icon': 'Icon',
  'edit.tabIcons': 'Icons',
  'edit.tabEmoji': 'Emoji',
  'edit.tabLetter': 'Letter',
  'edit.letter': 'Letter',
  'edit.letterHelp': 'Set in the display face, in the habit colour.',
  'edit.colour': 'Colour',
  'edit.colourAria': 'Colour {hex}',
  'edit.customColour': 'Custom colour',
  'edit.target': 'Daily target',
  'edit.targetOne': 'One tick fills the square.',
  'edit.targetMany': 'Each tick fills a {fraction} of the square. A day counts toward a streak only at {n}.',
  'edit.targetChanged': 'Changing the target re-scores your history: past days are measured against {next} instead of {prev}.',
  'edit.range': 'Grid range',
  'edit.add': 'Add habit',
  'edit.deleteHabit': 'Delete habit',
  'edit.needName': 'Give it a name first.',
  'edit.added': '{name} added.',
  'edit.decrease': 'Decrease {label}',
  'edit.increase': 'Increase {label}',
  'edit.countFor': 'count for {date}',

  'frac.2': 'half', 'frac.3': 'third', 'frac.4': 'quarter', 'frac.5': 'fifth',
  'frac.6': 'sixth', 'frac.8': 'eighth', 'frac.other': '1/{n}',

  'icons.Movement': 'Movement', 'icons.Body': 'Body', 'icons.Mind': 'Mind',
  'icons.Craft': 'Craft', 'icons.Home': 'Home', 'icons.Discipline': 'Discipline',

  'set.nameHelp': 'Stored on this device only. It appears on the home screen and in export filenames.',
  'set.appearance': 'Appearance',
  'set.language': 'Language',
  'set.theme': 'Theme',
  'set.themeAuto': 'Auto · match system',
  'set.themeLight': '{name} · light',
  'set.whenDark': 'When dark',
  'set.whenLight': 'When light',
  'set.accent': 'Accent colour',
  'set.accentHelp': 'The accent colours buttons, the focus ring and the marker on today. Each theme has its own; set one here to override them all.',
  'set.exclusive': 'Theme only for this app',
  'set.exclusiveOffHelp': 'The theme is shared with your other apps: change it here and they follow. Turn this on to give Habit Grid a look of its own.',
  'set.exclusiveOnHelp': 'Habit Grid keeps its own theme. Changing the theme in your other apps no longer affects it, and changing it here no longer affects them.',
  'set.autoHelp': 'Auto follows your phone between the two themes above. The accent colour applies to whichever is showing.',
  'set.gridSection': 'Grid',
  'set.weekStart': 'Week starts on',
  'set.monday': 'Monday',
  'set.sunday': 'Sunday',
  'set.defaultRange': 'Default range',
  'set.cellUnit': 'Cell unit',
  'set.unitAuto': 'Automatic',
  'set.unitDay': 'Always days',
  'set.unitWeek': 'Always weeks',
  'set.unitMonth': 'Always months',
  'set.gridHelp': 'Automatic picks the cell unit that fits each range — days up to two years, then weeks, then months. A habit’s own range is set when you edit it.',
  'set.dataSection': 'Your data',
  'set.export': 'Export a copy',
  'set.copy': 'Copy to clipboard',
  'set.copyNote': 'fallback',
  'set.import': 'Import a file',
  'set.restoreBackup': 'Restore backup',
  'set.restoreNote': 'from last import',
  'set.restoreTitle': 'Restore the pre-import backup?',
  'set.restoreBody': 'This replaces everything currently in the app with the snapshot taken just before your last import.',
  'set.restored': 'Backup restored.',
  'set.storageLine': '{habits} · {size} stored · {export}.',
  'set.lastExport': 'last export {date}',
  'set.neverExported': 'never exported',
  'set.appSection': 'App',
  'set.about': 'About your data',
  'set.aboutTitle': 'Where your data lives',
  'set.aboutBody1': 'Everything is in this browser, under one key, on this device. The app makes no network requests of any kind — its content security policy forbids them outright, so it cannot phone home even by mistake.',
  'set.aboutBody2': 'Nothing is backed up for you. Clearing site data, or uninstalling, erases it. Export now and then.',
  'set.deleteAll': 'Delete everything',
  'set.deleteAllTitle': 'Delete everything?',
  'set.deleteAllBody': 'Every habit, every tick, your name and settings. There is no undo and no copy anywhere else. Export first if you are not certain.',
  'set.footer': 'Habit Grid · local-first · no accounts, no server, no requests',
  'set.exported': 'Exported {file}',
  'set.exportBlocked': 'This browser blocked the download. Try Copy instead.',
  'set.copied': 'Copied to the clipboard.',
  'set.copyFailed': 'Could not copy.',
  'set.copyBlocked': 'This browser would not let the app copy.',

  'imp.refused': 'That import was refused',
  'imp.refusedBody': 'Nothing was changed. {errors}',
  'imp.title': 'Import {habits}?',
  'imp.body': 'That file holds {habits}, {days} of history and {ticks}. Your current data is backed up first either way.',
  'imp.merge': 'Merge',
  'imp.mergeNote': 'keep both, higher count wins',
  'imp.replace': 'Replace',
  'imp.replaceNote': 'wipe, then load',
  'imp.merged': 'Merged.',
  'imp.replaced': 'Replaced.',

  'err.notExport': 'That file is not a Habit Grid export.',
  'err.newerSchema': 'That file was written by a newer version of Habit Grid (schema {n}). Update the app first.',
  'err.noHabits': 'That file has no habits list.',
  'err.noEntries': 'That file has no entries object.',
  'err.badHabit': 'Habit {i} is not an object.',
  'err.badId': 'Habit {i} has an invalid id.',
  'err.dupId': 'Two habits share the id {id}.',
  'err.badDate': 'Habit {i} had an unreadable created date; today was used.',
  'err.skipped': '{n} skipped.',
  'err.noFile': 'No file chosen.',
  'err.tooLarge': 'That file is too large to be an export.',
  'err.unreadable': 'That file could not be read.',
  'err.notJson': 'That file is not valid JSON.',
  'err.quota': 'Storage is full — that change was not saved. Export your data, then delete a habit to free space.',
  'err.security': 'This browser is blocking local storage (private mode?). Nothing can be saved.',
  'err.generic': 'Could not save to this device.',
  'err.parse': 'Stored data could not be parsed. It has been left untouched.',

  // The "new version is ready" bar carries its own strings — it ships in
  // js/update.js, shared with the other apps, and has to work even if this
  // module never loads.
  'app.otherTab': 'Updated from another tab.',
  'app.installed': 'Installed. It works offline now.',

  'range.1w': '1 week', 'range.1m': '1 month', 'range.3m': '3 months',
  'range.6m': '6 months', 'range.1y': '1 year', 'range.2y': '2 years',
  'range.5y': '5 years', 'range.10y': '10 years', 'range.all': 'All time',

  'pin.add': 'Add to hub',
  'pin.remove': 'On the hub',
  'pin.added': '{name} now shows on the hub.',
  'pin.removed': '{name} removed from the hub.',
  'pin.offHelp': 'Show this habit’s grid on the MyApps home screen.',
  'pin.onHelp': 'This habit’s grid appears on the MyApps home screen. Tap to remove it.',
  'pin.full': 'The hub holds {n} grids. Remove one first.',
  'pin.fullHelp': 'The hub holds {n} grids at a time. Tap to swap one out for this habit.',
  'pin.swapTitle': 'The hub is full',
  'pin.swapBody': 'It holds {n} grids at a time. Pick the one to replace.',
  'pin.replace': 'Replace',
  'pin.swapped': '{added} replaced {removed} on the hub.',

  'theme.ledger': 'Ledger', 'theme.black': 'True black', 'theme.slate': 'Slate',
  'theme.midnight': 'Midnight', 'theme.paper': 'Paper', 'theme.daylight': 'Daylight',
  'theme.ambar': 'Amber', 'theme.safira': 'Sapphire', 'theme.esmeralda': 'Emerald',
  'theme.violeta': 'Violet', 'theme.coral': 'Coral', 'theme.sunset': 'Sunset',
};

const PT = {
  'app.tagline': 'Uma década de pequenas marcas, e nada mais. Sem contas, sem lembretes, sem servidor.',

  'n.day': '{n} dia|{n} dias',
  'n.tick': '{n} marcação|{n} marcações',
  'n.habit': '{n} hábito|{n} hábitos',
  'n.completedDay': '{n} dia concluído|{n} dias concluídos',
  'n.entry': '{n} registro|{n} registros',

  'common.done': 'feito',
  'common.notDone': 'não feito',
  'common.ofDone': '{n} de {t} feitos',
  'common.cancel': 'Cancelar',
  'common.close': 'Fechar',
  'common.save': 'Salvar',
  'common.delete': 'Excluir',
  'common.dismiss': 'Dispensar',
  'common.undo': 'Desfazer',
  'common.today': 'Hoje',
  'common.back': 'Voltar',
  'common.settings': 'Ajustes',
  'common.reset': 'Redefinir',
  'common.restore': 'Restaurar',
  'common.ofDays': '{done} de {days} dias',
  'common.less': 'Menos',
  'common.more': 'Mais',

  'onboard.question': 'Como o app deve te chamar?',
  'onboard.namePlaceholder': 'Seu nome',
  'onboard.privacy': 'Tudo o que você registra fica neste navegador, neste aparelho, e em nenhum outro lugar. Não há conta para perder nem servidor para vazar. Isso também significa que é você quem cuida: exporte uma cópia de vez em quando.',
  'onboard.install': 'Adicionar à tela inicial',
  'onboard.installWhy': 'Instalar mantém o app disponível offline e evita que o navegador apague seus dados depois de um tempo sem visita. Vale os dez segundos.',
  'onboard.start': 'Começar',
  'onboard.hasExport': 'Já tem uma exportação? Comece e depois use Ajustes → Importar.',
  'onboard.installManual': 'Abra o menu do navegador e escolha "Adicionar à tela inicial".',

  'home.greeting': 'Olá, {name}',
  'home.empty': 'Nada ainda',
  'home.emptyBody': 'Adicione um hábito e comece a preencher a grade. Um quadrado por dia.',
  'home.addHabit': 'Adicionar hábito',
  'home.view': 'Visualização',
  'home.grid': 'Grade',
  'home.week': 'Semana',
  'home.todayAria': 'Hoje, {name} — {status}. Toque para marcar.',
  'home.noStreak': 'Sem sequência · {total} no total',
  'home.notStarted': 'Ainda não começou',
  'home.perDay': '{n}× por dia',

  'nudge.never': 'Você nunca exportou uma cópia disto.',
  'nudge.stale': 'A última exportação foi há {ago}.',
  'nudge.action': 'Exportar',
  'nudge.dismiss': 'Dispensar por uma semana',

  'week.title': 'Últimos 7 dias',
  'week.empty': 'Adicione um hábito para ver a semana.',
  'week.cellAria': '{name}, {date} — {status}',

  'cal.settings': 'Ajustes do hábito',
  'cal.prev': 'Mês anterior',
  'cal.next': 'Próximo mês',
  'cal.oncePerDay': 'Uma vez por dia',
  'cal.ticksPerDay': '{n} marcações por dia',
  'cal.started': 'Começou em {date}.',
  'cal.monthAria': '{name}, {month}',

  'stat.current': 'Sequência atual',
  'stat.longest': 'Maior sequência',
  'stat.completed': 'Dias concluídos',
  'stat.rate': 'Taxa de conclusão',
  'stat.ticks': 'Total de marcações',
  'stat.tracked': 'Dias acompanhados',
  'stat.lastTick': 'Desde a última marcação',
  'stat.lastTickNever': 'Nunca',
  'stat.lastTickToday': 'Hoje',
  'stat.recent': 'Últimos {n} dias',
  'stat.bestDay': 'Melhor dia da semana',
  'stat.unit.days': 'dias',
  'stat.unit.day': 'dia',

  'zoom.tapADay': 'Toque em um dia para marcá-lo.',
  'zoom.weekOf': 'Semana de {date}',

  'del.title': 'Excluir {name}?',
  'del.body': 'Isso remove {days} e {ticks}. Você tem dez segundos para desfazer; depois disso, some de vez.',
  'del.keep': 'Manter',
  'del.done': '{name} foi excluído.',
  'del.undone': '{name} está de volta.',

  'notFound.title': 'Não encontrado',
  'notFound.head': 'Esse hábito não existe mais',
  'notFound.body': 'Pode ter sido excluído em outra aba.',

  'edit.new': 'Novo hábito',
  'edit.edit': 'Editar hábito',
  'edit.name': 'Nome',
  'edit.namePlaceholder': 'Ler, Correr, Água…',
  'edit.untitled': 'Sem nome',
  'edit.icon': 'Ícone',
  'edit.tabIcons': 'Ícones',
  'edit.tabEmoji': 'Emoji',
  'edit.tabLetter': 'Letra',
  'edit.letter': 'Letra',
  'edit.letterHelp': 'Na fonte de destaque, na cor do hábito.',
  'edit.colour': 'Cor',
  'edit.colourAria': 'Cor {hex}',
  'edit.customColour': 'Cor personalizada',
  'edit.target': 'Meta diária',
  'edit.targetOne': 'Uma marcação preenche o quadrado.',
  'edit.targetMany': 'Cada marcação preenche {fraction} do quadrado. O dia só conta para a sequência ao chegar em {n}.',
  'edit.targetChanged': 'Mudar a meta recalcula seu histórico: os dias passados passam a ser medidos por {next} em vez de {prev}.',
  'edit.range': 'Período da grade',
  'edit.add': 'Adicionar hábito',
  'edit.deleteHabit': 'Excluir hábito',
  'edit.needName': 'Dê um nome primeiro.',
  'edit.added': '{name} adicionado.',
  'edit.decrease': 'Diminuir {label}',
  'edit.increase': 'Aumentar {label}',
  'edit.countFor': 'contagem de {date}',

  'frac.2': 'metade', 'frac.3': 'um terço', 'frac.4': 'um quarto', 'frac.5': 'um quinto',
  'frac.6': 'um sexto', 'frac.8': 'um oitavo', 'frac.other': '1/{n}',

  'icons.Movement': 'Movimento', 'icons.Body': 'Corpo', 'icons.Mind': 'Mente',
  'icons.Craft': 'Ofício', 'icons.Home': 'Casa', 'icons.Discipline': 'Disciplina',

  'set.nameHelp': 'Guardado apenas neste aparelho. Aparece na tela inicial e no nome dos arquivos exportados.',
  'set.appearance': 'Aparência',
  'set.language': 'Idioma',
  'set.theme': 'Tema',
  'set.themeAuto': 'Automático · seguir o sistema',
  'set.themeLight': '{name} · claro',
  'set.whenDark': 'No escuro',
  'set.whenLight': 'No claro',
  'set.accent': 'Cor de destaque',
  'set.accentHelp': 'O destaque colore botões, o anel de foco e a marca do dia de hoje. Cada tema tem a sua; defina uma aqui para valer em todos.',
  'set.exclusive': 'Tema só deste app',
  'set.exclusiveOffHelp': 'O tema é compartilhado com seus outros apps: mude aqui e eles acompanham. Ative para dar ao Habit Grid um visual próprio.',
  'set.exclusiveOnHelp': 'O Habit Grid mantém o tema dele. Mudar o tema nos outros apps não afeta mais este, e mudar aqui não afeta os outros.',
  'set.autoHelp': 'O modo automático segue o aparelho entre os dois temas acima. A cor de destaque vale para o que estiver aparecendo.',
  'set.gridSection': 'Grade',
  'set.weekStart': 'A semana começa em',
  'set.monday': 'Segunda-feira',
  'set.sunday': 'Domingo',
  'set.defaultRange': 'Período padrão',
  'set.cellUnit': 'Unidade da célula',
  'set.unitAuto': 'Automática',
  'set.unitDay': 'Sempre dias',
  'set.unitWeek': 'Sempre semanas',
  'set.unitMonth': 'Sempre meses',
  'set.gridHelp': 'O modo automático escolhe a unidade que cabe em cada período — dias até dois anos, depois semanas, depois meses. O período de cada hábito é definido ao editá-lo.',
  'set.dataSection': 'Seus dados',
  'set.export': 'Exportar uma cópia',
  'set.copy': 'Copiar para a área de transferência',
  'set.copyNote': 'alternativa',
  'set.import': 'Importar um arquivo',
  'set.restoreBackup': 'Restaurar backup',
  'set.restoreNote': 'da última importação',
  'set.restoreTitle': 'Restaurar o backup anterior à importação?',
  'set.restoreBody': 'Isso substitui tudo o que está no app pela cópia feita logo antes da sua última importação.',
  'set.restored': 'Backup restaurado.',
  'set.storageLine': '{habits} · {size} guardados · {export}.',
  'set.lastExport': 'última exportação em {date}',
  'set.neverExported': 'nunca exportado',
  'set.appSection': 'Aplicativo',
  'set.about': 'Sobre seus dados',
  'set.aboutTitle': 'Onde ficam seus dados',
  'set.aboutBody1': 'Tudo fica neste navegador, sob uma única chave, neste aparelho. O app não faz nenhum tipo de requisição de rede — sua política de segurança de conteúdo proíbe isso de forma absoluta, então ele não consegue ligar para casa nem por engano.',
  'set.aboutBody2': 'Nada é salvo em nenhum outro lugar por você. Limpar os dados do site, ou desinstalar, apaga tudo. Exporte de vez em quando.',
  'set.deleteAll': 'Excluir tudo',
  'set.deleteAllTitle': 'Excluir tudo?',
  'set.deleteAllBody': 'Todos os hábitos, todas as marcações, seu nome e seus ajustes. Não há como desfazer e não existe cópia em outro lugar. Exporte antes se tiver qualquer dúvida.',
  'set.footer': 'Habit Grid · local-first · sem contas, sem servidor, sem requisições',
  'set.exported': '{file} exportado',
  'set.exportBlocked': 'Este navegador bloqueou o download. Tente Copiar.',
  'set.copied': 'Copiado para a área de transferência.',
  'set.copyFailed': 'Não foi possível copiar.',
  'set.copyBlocked': 'Este navegador não deixou o app copiar.',

  'imp.refused': 'A importação foi recusada',
  'imp.refusedBody': 'Nada foi alterado. {errors}',
  'imp.title': 'Importar {habits}?',
  'imp.body': 'O arquivo tem {habits}, {days} de histórico e {ticks}. Seus dados atuais são salvos em backup de qualquer forma.',
  'imp.merge': 'Mesclar',
  'imp.mergeNote': 'mantém os dois, vence a maior contagem',
  'imp.replace': 'Substituir',
  'imp.replaceNote': 'apaga e carrega',
  'imp.merged': 'Mesclado.',
  'imp.replaced': 'Substituído.',

  'err.notExport': 'Esse arquivo não é uma exportação do Habit Grid.',
  'err.newerSchema': 'Esse arquivo foi escrito por uma versão mais nova do Habit Grid (schema {n}). Atualize o app primeiro.',
  'err.noHabits': 'Esse arquivo não tem uma lista de hábitos.',
  'err.noEntries': 'Esse arquivo não tem um objeto de registros.',
  'err.badHabit': 'O hábito {i} não é um objeto.',
  'err.badId': 'O hábito {i} tem um id inválido.',
  'err.dupId': 'Dois hábitos usam o id {id}.',
  'err.badDate': 'O hábito {i} tinha uma data de criação ilegível; usamos a de hoje.',
  'err.skipped': '{n} ignorados.',
  'err.noFile': 'Nenhum arquivo escolhido.',
  'err.tooLarge': 'Esse arquivo é grande demais para ser uma exportação.',
  'err.unreadable': 'Não foi possível ler esse arquivo.',
  'err.notJson': 'Esse arquivo não é um JSON válido.',
  'err.quota': 'O armazenamento está cheio — essa mudança não foi salva. Exporte seus dados e exclua um hábito para liberar espaço.',
  'err.security': 'Este navegador está bloqueando o armazenamento local (modo privado?). Nada pode ser salvo.',
  'err.generic': 'Não foi possível salvar neste aparelho.',
  'err.parse': 'Não foi possível ler os dados guardados. Eles foram deixados intactos.',

  'app.otherTab': 'Atualizado a partir de outra aba.',
  'app.installed': 'Instalado. Agora funciona offline.',

  'range.1w': '1 semana', 'range.1m': '1 mês', 'range.3m': '3 meses',
  'range.6m': '6 meses', 'range.1y': '1 ano', 'range.2y': '2 anos',
  'range.5y': '5 anos', 'range.10y': '10 anos', 'range.all': 'Desde o início',

  'pin.add': 'Adicionar ao hub',
  'pin.remove': 'No hub',
  'pin.added': '{name} agora aparece no hub.',
  'pin.removed': '{name} saiu do hub.',
  'pin.offHelp': 'Mostrar a grade deste hábito na tela inicial do MyApps.',
  'pin.onHelp': 'A grade deste hábito aparece na tela inicial do MyApps. Toque para tirar.',
  'pin.full': 'O hub comporta {n} grades. Tire uma antes.',
  'pin.fullHelp': 'O hub comporta {n} grades por vez. Toque para trocar uma por este hábito.',
  'pin.swapTitle': 'O hub está cheio',
  'pin.swapBody': 'Ele comporta {n} grades por vez. Escolha qual substituir.',
  'pin.replace': 'Substituir',
  'pin.swapped': '{added} entrou no lugar de {removed}.',

  'theme.ledger': 'Livro-razão', 'theme.black': 'Preto absoluto', 'theme.slate': 'Ardósia',
  'theme.midnight': 'Meia-noite', 'theme.paper': 'Papel', 'theme.daylight': 'Luz do dia',
  'theme.ambar': 'Âmbar', 'theme.safira': 'Safira', 'theme.esmeralda': 'Esmeralda',
  'theme.violeta': 'Violeta', 'theme.coral': 'Coral', 'theme.sunset': 'Poente',
};

const LOCALES = {
  en: {
    monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    monthsLong: ['January', 'February', 'March', 'April', 'May', 'June', 'July',
      'August', 'September', 'October', 'November', 'December'],
    weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    weekdayLetters: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
    longDate: (d, m, y, showYear) => d + ' ' + m + (showYear ? ' ' + y : ''),
    shortDate: (d, m) => d + ' ' + m,
    monthYear: (m, y) => m + ' ' + y,
  },
  'pt-BR': {
    monthsShort: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
    monthsLong: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
      'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
    weekdays: ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira',
      'sexta-feira', 'sábado'],
    weekdayLetters: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'],
    longDate: (d, m, y, showYear) => d + ' de ' + m + (showYear ? ' de ' + y : ''),
    shortDate: (d, m) => d + ' ' + m,
    monthYear: (m, y) => m.charAt(0).toUpperCase() + m.slice(1) + ' de ' + y,
  },
};

const DICTS = { en: EN, 'pt-BR': PT };

let current = 'en';

export function lang() { return current; }

export function setLang(code) {
  current = DICTS[code] ? code : 'en';
  if (typeof document !== 'undefined') document.documentElement.setAttribute('lang', current);
  return current;
}

/** Best guess from the browser, used only before the user has chosen. */
export function detectLang() {
  const list = (typeof navigator !== 'undefined' && navigator.languages) || [];
  const all = list.length ? list : [(typeof navigator !== 'undefined' && navigator.language) || 'en'];
  for (const tag of all) {
    if (!tag) continue;
    if (DICTS[tag]) return tag;
    if (String(tag).toLowerCase().indexOf('pt') === 0) return 'pt-BR';
    if (String(tag).toLowerCase().indexOf('en') === 0) return 'en';
  }
  return 'en';
}

export function t(key, vars) {
  const dict = DICTS[current] || EN;
  let out = dict[key];
  if (out === undefined) out = EN[key];
  if (out === undefined) return key;
  if (!vars) return out;
  return out.replace(/\{(\w+)\}/g, (whole, name) =>
    (vars[name] === undefined ? whole : String(vars[name])));
}

/** "3 days" / "3 dias". One form for n === 1, another for everything else. */
export function plural(n, key) {
  const forms = t(key, { n }).split('|');
  return forms[n === 1 ? 0 : Math.min(1, forms.length - 1)];
}

const locale = () => LOCALES[current] || LOCALES.en;

export const monthsShort = () => locale().monthsShort;
export const monthsLong = () => locale().monthsLong;
export const weekdayLetters = () => locale().weekdayLetters;
export const weekdayNames = () => locale().weekdays;

export function monthShort(m /* 1-based */) { return locale().monthsShort[m - 1]; }
export function monthLong(m) { return locale().monthsLong[m - 1]; }
export function weekdayLetter(key) { return locale().weekdayLetters[parseKey(key).getDay()]; }
export function weekdayName(index) { return locale().weekdays[index]; }

/** "19 August" / "19 de agosto", with the year only when it is not this one. */
export function longDate(key) {
  const y = yearOf(key);
  const showYear = y !== new Date().getFullYear();
  return locale().longDate(dayOf(key), monthLong(monthOf(key)), y, showYear);
}

export function shortDate(key) {
  return locale().shortDate(dayOf(key), monthShort(monthOf(key)));
}

/** "August 2026" / "Agosto de 2026". */
export function monthYear(key) {
  return locale().monthYear(monthLong(monthOf(key)), yearOf(key));
}

export function rangeLabel(id) { return t('range.' + id); }
export function themeLabel(id) { return t('theme.' + id); }
