# -*- coding: utf-8 -*-
"""Buduje index.html (prezentacja) z full.html (pelna wersja, ze slajdami do decyzji).

Wycina trzy slajdy oznaczone "DO DECYZJI" razem z martwym CSS-em, przelicza
numeracje i czasy, i zostawia uproszczony skrypt prezentera.

    python assets/pitch/build.py

Edytuj ZAWSZE full.html. index.html jest generowany i kazda recznie wpisana tam
zmiana zniknie przy nastepnym uruchomieniu tego skryptu.
"""
import io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'full.html')
OUT = os.path.join(HERE, 'index.html')

src = io.open(SRC, encoding='utf-8').read()
s = src


def cut(old, label):
    global s
    assert s.count(old) == 1, 'NOT UNIQUE: ' + label + ' (' + str(s.count(old)) + ')'
    s = s.replace(old, '')


def sub1(old, new, label):
    global s
    assert s.count(old) == 1, 'NOT UNIQUE: ' + label + ' (' + str(s.count(old)) + ')'
    s = s.replace(old, new)


# ---------------------------------------------------------------- slajdy 6-7-8
m = re.search(r'<!-- 06 -->.*?\n(?=<!-- 09 -->)', s, re.S)
assert m, 'NO SLIDES 06-08'
s = s[:m.start()] + s[m.end():]

# ---------------------------------------------------------------- martwy CSS po nich
start = s.find('  /* ---------- animated orchestration diagram ---------- */')
assert start > -1, 'NO ORBIT BLOCK'
end = s.find('@keyframes fly {', start)
assert end > -1, 'NO ORBIT END'
end = s.find('\n', end) + 1
s = s[:start] + s[end:]

cut("""  .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 26px; margin-top: 44px; }
  .box { border: 1px solid var(--rule); padding: 24px 22px; display: flex; flex-direction: column; gap: 12px; }
  .box--lime { border-color: var(--lime); }
  .box .n { font-family: var(--mono); font-size: .7rem; letter-spacing: .12em; color: var(--lime); }
  .box h3 { font-size: clamp(1rem, 1.6vw, 1.25rem); }
  .box p { font-size: clamp(.88rem, 1.3vw, 1rem); color: var(--ink-2); }

""", 'cols/box css')

cut("""  /* slajdy do decyzji — zostaja w decku, wypadaja z wersji krotkiej (klawisz O) */
  .flag {
    position: absolute; z-index: 4;
    top: clamp(22px, 3.6vw, 48px); right: clamp(28px, 5vw, 72px);
    font-family: var(--mono); font-size: clamp(.58rem, .9vw, .68rem);
    letter-spacing: .16em; text-transform: uppercase; color: var(--yellow);
    border: 1px solid rgba(238, 251, 99, .38); border-radius: 3px; padding: 6px 11px;
  }

""", 'flag css')

cut("""    .orbit .trail, .orbit .nyan { display: none; }
    .orbit { max-height: none; }
""", 'print orbit')

cut("""    .is-playing .orbit .g, .is-playing .orbit .tick, .is-playing .orbit-cap { animation: none !important; }
    .is-playing .orbit .trail, .is-playing .orbit .nyan { animation: none !important; display: none; }
""", 'reduced-motion orbit')

# ---------------------------------------------------------------- numeracja i czasy
order = re.findall(r'<!-- \d\d -->', s)
assert len(order) == 8, 'oczekiwano 8 slajdow, jest ' + str(len(order))
for i, tag in enumerate(order):
    s = s.replace(tag, '<!--@%02d@-->' % (i + 1), 1)
s = re.sub(r'<!--@(\d\d)@-->', lambda mm: '<!-- ' + mm.group(1) + ' -->', s)

times = ['0:00', '0:15', '0:50', '1:10', '1:20', '3:00', '3:25', '3:40']
slots = list(re.finditer(r'data-time="[^"]*"', s))
assert len(slots) == 8, 'oczekiwano 8 znacznikow czasu, jest ' + str(len(slots))
for mm, t in zip(reversed(slots), reversed(times)):
    s = s[:mm.start()] + 'data-time="' + t + '"' + s[mm.end():]

s = re.sub(r'\s*data-time-short="[^"]*"', '', s)

# ---------------------------------------------------------------- notatka do dema
old_tail = 'Nie tłumaczymy w trakcie, jak to działa. Wyjaśnienie idzie po demie.'
new_tail = (
    'W TEJ WERSJI NIE MA SLAJDOW WYJASNIAJACYCH — powiedz te rzeczy na glos w trakcie dema, jednym zdaniem kazda: '
    '(1) porownujemy zdolnosci, nie nazwy produktow; '
    '(2) werdykty biora sie z kuratorowanego katalogu, nie z rozumowania modelu na zywo; '
    '(3) kwoty liczy czysta funkcja z faktur klienta — model ich nie dotyka; '
    '(4) pewnosc podajemy jako pasmo: wysoka, srednia, niska, nigdy jako procent.'
)
assert s.count(old_tail) == 1, 'demo note tail'
s = s.replace(old_tail, new_tail)

# ---------------------------------------------------------------- chrome
sub1('<title>Mercatify — prezentacja (pełna)</title>',
     '<title>Mercatify — prezentacja</title>', 'title')
sub1('<div class="help">← → slajdy · N notatki · T stoper · R powtórka · O krótka wersja · P druk</div>',
     '<div class="help">← → slajdy · N notatki · T stoper · P druk</div>', 'help')
sub1('<div class="count" id="count">1 / 11</div>', '<div class="count" id="count">1 / 8</div>', 'count')
sub1('<!doctype html>\n',
     '<!doctype html>\n<!-- PLIK GENEROWANY z full.html przez build.py — nie edytuj tutaj -->\n', 'banner')

# ---------------------------------------------------------------- skrypt bez animacji i przelacznika
SCRIPT = """  (function () {
    var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
    var bar = document.getElementById('bar');
    var count = document.getElementById('count');
    var notes = document.getElementById('notes');
    var noteBody = document.getElementById('noteBody');
    var clock = document.getElementById('clock');
    var index = 0;

    slides.forEach(function (slide) {
      var note = slide.querySelector('.slide__note');
      if (note) note.textContent = slide.getAttribute('data-note') || '';
    });

    function render() {
      slides.forEach(function (slide, i) { slide.classList.toggle('is-active', i === index); });
      bar.style.width = ((index + 1) / slides.length * 100) + '%';
      count.textContent = (index + 1) + ' / ' + slides.length;
      noteBody.textContent = slides[index].getAttribute('data-note') || '';
    }

    function go(step) {
      index = Math.min(slides.length - 1, Math.max(0, index + step));
      render();
    }

    var timerId = null;
    var left = 300;

    function paint() {
      var m = Math.floor(Math.abs(left) / 60);
      var s = Math.abs(left) % 60;
      clock.textContent = (left < 0 ? '-' : '') + m + ':' + (s < 10 ? '0' : '') + s + '  ·  ' + (slides[index].getAttribute('data-time') || '');
      clock.className = 'clock' + (left <= 0 ? ' over' : (left <= 60 ? ' warn' : ''));
    }

    function toggleTimer() {
      if (timerId) { clearInterval(timerId); timerId = null; clock.textContent = 'stoper wstrzymany'; return; }
      timerId = setInterval(function () { left -= 1; paint(); }, 1000);
      paint();
    }

    document.addEventListener('keydown', function (event) {
      var key = event.key;
      if (key === 'ArrowRight' || key === ' ' || key === 'PageDown') { event.preventDefault(); go(1); }
      else if (key === 'ArrowLeft' || key === 'PageUp') { event.preventDefault(); go(-1); }
      else if (key === 'Home') { index = 0; render(); }
      else if (key === 'End') { index = slides.length - 1; render(); }
      else if (key === 'n' || key === 'N') { notes.hidden = !notes.hidden; }
      else if (key === 't' || key === 'T') { toggleTimer(); }
      else if (key === 'p' || key === 'P') { window.print(); }
    });

    document.addEventListener('click', function (event) {
      if (event.target.closest('#notes')) return;
      go(event.clientX < window.innerWidth * 0.25 ? -1 : 1);
    });

    render();
  })();
"""
m = re.search(r'(?<=<script>\n).*?(?=</script>)', s, re.S)
assert m, 'NO SCRIPT'
s = s[:m.start()] + SCRIPT + s[m.end():]

io.open(OUT, 'w', encoding='utf-8', newline='').write(s)
sys.stdout.write('index.html zbudowany z full.html  ->  %d znakow\n' % len(s))
