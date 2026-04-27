function Translit_Latin_To_Cyrillic(word: string) {
    const translit_map: any = {
        'a': 'а',
        'b': 'б',
        'c': 'ц',
        'ch': 'ч',
        'd': 'д',
        'e': 'е',
        'eh': 'э',
        'f': 'ф',
        'g': 'г',
        'h': 'х',
        'i': 'и',
        'iu': 'ю',
        'iy': 'ий',
        'j': 'й',
        'jo': 'ё',
        'ju': 'ю',
        'k': 'к',
        'kh': 'х',
        'l': 'л',
        'm': 'м',
        'n': 'н',
        'o': 'о',
        'p': 'п',
        'r': 'р',
        's': 'с',
        'sch': 'щ',
        'sh': 'ш',
        't': 'т',
        'ts': 'ц',
        'u': 'у',
        'v': 'в',
        'y': 'ы',
        'ya': 'я',
        'yo': 'ё',
        'z': 'з',
        'zh': 'ж',
        "'": 'ь',
        "`": 'ъ',
        "w": 'в',
        'q': 'кю',
        'x': 'кс'
    };
    const sentence = word.toLowerCase().split('\r\n')
    let res = ''
    for (const stce in sentence) {
        //берем предложение
        const word_list = sentence[stce].split(' ')
        for (const key in word_list) {
            const char_list = word_list[key].split('')
            let i=0;
            while (i < char_list.length) {
                if (i+3 <= char_list.length) {
                    let trible = char_list[i] + char_list[i+1] + char_list[i+2]
                    if (translit_map[trible]) {
                        res += translit_map[trible]
                        i+=3
                        continue
                    }
                }
                if (i+2<= char_list.length) {
                    let double = char_list[i] + char_list[i+1]
                    if (translit_map[double]) {
                        res += translit_map[double]
                        i+=2
                        continue
                    }
                }
                if (translit_map[char_list[i]]) {
                    res += translit_map[char_list[i]]
                    i+=1
                    continue
                }
                if (char_list[i].match(/^[аА-яЯ.,!?":;+-=%&^#]+$/)) {
                    res += char_list[i]
                }
                i+=1
            }
            res += " "
        }
    }
    return res
}
function Translit_Cyrillic_To_Latin(word: string) {
    const translit_map: any = {
        'а': 'a',
        'б': 'b',
        'ц': 'c' || 'ts',
        'ч': 'ch',
        'д': 'd',
        'е': 'e' || 'ie',
        'э': 'eh',
        'ф': 'f',
        'г': 'g',
        'х': 'h' || 'kh',
        'и': 'i',
        'я': 'ya',
        'ю': 'iu'||'ju',
        'ий': 'iy',
        'й': 'j',
        'ё': 'jo' || 'yo',
        'к': 'k',
        'л': 'l',
        'м': 'm',
        'н': 'n',
        'о': 'o',
        'п': 'p',
        'р': 'r',
        'с': 's',
        'щ': 'sch',
        'ш': 'sh',
        'т': 't',
        'у': 'u',
        'в': 'v' || 'w',
        'ы': 'y',
        'з': 'z',
        'ж': 'zh',
        'ь': "'",
        "ъ": '`',
        'кю': 'q',
        'кс': 'x'
    };
    const sentence = word.toLowerCase().split('\r\n')
    let res = ''
    for (const stce in sentence) {
        //берем предложение
        const word_list = sentence[stce].split(' ')
        for (const key in word_list) {
            const char_list = word_list[key].split('')
            let i=0;
            while (i < char_list.length) {
                if (translit_map[char_list[i]]) {
                    res += translit_map[char_list[i]]
                    i+=1
                    continue
                }
                if (i+2<= char_list.length) {
                    let double = char_list[i] + char_list[i+1]
                    if (translit_map[double]) {
                        res += translit_map[double]
                        i+=2
                        continue
                    }
                }
                if (char_list[i].match(/^[aA-zZ.,!?":;+-=%&^#]+$/)) {
                    res += char_list[i]
                }
                i+=1
            }
            res += " "
        }
    }
    return res
}
