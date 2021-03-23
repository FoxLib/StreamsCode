
class x86 {

    constructor() {

        let el  = document.getElementById('terminal');
        let ctx = el.getContext('2d');
        let img = ctx.getImageData(0, 0, el.width, el.height);

        this.memory = new Uint8Array(1024*1024); // 1Mb
        this.canvas = {

            el:  el,
            ctx: ctx,
            w:   el.width,
            h:   el.height,
            img: img,
            refresh: 1,
            color: [
                0x000000, 0x0000aa, 0x00aa00, 0x00aaaa, 0xaa0000, 0xaa00aa, 0xaa5500, 0xaaaaaa, // 0..7
                0x555555, 0x5555ff, 0x55ff55, 0x55ffff, 0xff5555, 0xff55ff, 0xffff55, 0xffffff  // 8..15
            ]
        };

        this.reg = {
            ax: 0x0000,
            bx: 0x0000,
            cx: 0x0000,
            dx: 0x0000,
            sp: 0x0000,
            bp: 0x0000,
            si: 0x0000,
            di: 0x0000,
        };

        this.seg = {
            es: 0x0000,
            cs: 0x0000,
            ss: 0x0000,
            ds: 0x0000,
        };

        this.ip    = 0x0000; // cs:ip
        this.flags =  0x000;

        // Состояние текущей инструкции
        this.ops = {

            segment_id: 0,
            over:   0,
            opcode: 0x00, // 0..511
            i_size: 0,
            i_rep:  0,
            // Поля для ModRM
            i_modrm: 0,
            i_mod: 0,
            i_reg: 0,
            i_rm: 0,
            i_ea: 0,
            physea: 0,
        }

        this.testmon();
        this.refresh();
    }

    // Тестовые данные
    testmon() {

        for (let i = 0; i < 4000; i += 2)
            this.ww(0xb8000 + i, 0x1721 + i);

        // тестовая инструкция
        this.wb(0x0000, 0x2E);
        this.wb(0x0001, 0xF2);
        this.wb(0x0002, 0x03);
        this.wb(0x0003, 0x00);

        this.step();

    }

    // Исполнение инструкции
    step() {

        // Декодирование опкода
        let opcode = this.get_opcode();

        // Чтение байта modrm
        if (opcodemap_modrm[ opcode ]) {
            this.get_modrm16();
        }

        // Декодирование инструкции
    }

    // Чтение опкода
    get_opcode() {

        this.ops.i_size = 0;
        this.ops.i_rep  = 0;
        this.ops.over   = 0;
        this.ops.segment_id = REG_DS;

        while (this.ops.i_size < 16) {

            let data = this.fetch(1);

            switch (data) {

                // Получен расширенный опкод
                case 0x0F: this.ops.opcode = 0x100 + this.fetch(); return this.ops.opcode;

                // Сегментные префиксы
                case 0x26: this.ops.over = 1; this.ops.segment_id = 0; break;
                case 0x2E: this.ops.over = 1; this.ops.segment_id = 1; break;
                case 0x36: this.ops.over = 1; this.ops.segment_id = 2; break;
                case 0x3E: this.ops.over = 1; this.ops.segment_id = 3; break;
                case 0x64:
                case 0x65:
                case 0x66:
                case 0x67:
                    /* undefined opcode */
                    break;
                case 0xF0: break; // lock:
                case 0xF2: this.ops.i_rep = REPNZ; break;
                case 0xF3: this.ops.i_rep = REPZ; break;
                default:

                    this.ops.opcode = data;
                    return data;
            }

            this.ops.i_size++;
        }

        return 0;
    }

    // Прочитать эффективный адрес i_ea и параметры modrm
    get_modrm16() {

        this.ops.i_modrm =  this.fetch();
        this.ops.i_mod   =  this.ops.i_modrm >> 6;
        this.ops.i_reg   = (this.ops.i_modrm >> 3) & 7;
        this.ops.i_rm    =  this.ops.i_modrm & 7;
        this.ops.i_ea    =  0;

        // Расчет индекса
        switch (this.ops.i_rm) {

            case 0: this.ops.i_ea = (this.reg.bx + this.reg.si); break;
            case 1: this.ops.i_ea = (this.reg.bx + this.reg.di); break;
            case 2: this.ops.i_ea = (this.reg.bp + this.reg.si); break;
            case 3: this.ops.i_ea = (this.reg.bp + this.reg.di); break;
            case 4: this.ops.i_ea =  this.reg.si; break;
            case 5: this.ops.i_ea =  this.reg.di; break;
            case 6: this.ops.i_ea =  this.reg.bp; break;
            case 7: this.ops.i_ea =  this.reg.bx; break;
        }

        this.ops.i_ea &= 0xffff;

        // В случае если не segment override
        if (!this.ops.over) {

            if ((this.ops.i_rm === 6 && this.ops.i_mod) || (this.ops.i_rm === 2) || (this.ops.i_rm === 3)) {
                this.ops.segment_id = REG_SS;
            }
        }

        // Модифицирующие биты modrm
        switch (this.ops.i_mod) {

            case 0: if (this.ops.i_rm === 6) this.ops.i_ea = this.fetch_word(); break;
            case 1: this.ops.i_ea += this.fetch_signed(); break;
            case 2: this.ops.i_ea += this.fetch_word(); break;
            case 3: this.ops.i_ea = 0; break;
        }

        this.ops.physea = 16*this.get_segment(this.ops.segment_id) + this.ops.i_ea;
    }

    // Получение R/M части; i_w = 1 (word), i_w = 0 (byte)
    get_rm(i_w) {

        if (this.ops.i_mod === 3) {
            return this.get_reg(this.ops.i_rm, i_w);
        } else {
            return this.read(this.ops.physea, i_w + 1);
        }
    }

    // Сохранение данных в R/M
    put_rm(i_w, data) {

        if (this.ops.i_mod == 3) {
            this.put_reg(this.ops.i_rm, i_w, data);
        } else {
            this.write(this.ops.physea, i_w+1, data);
        }
    }


    // Чтение и запись
    wb(addr, v) {
        this.memory[addr & 0xFFFFF] = v & 255;
        this.update_text_byte(addr);
    }

    rb(addr) { return this.memory[addr & 0xFFFFF]; }
    rw(addr) { return this.rb(addr) + 256*this.rb(addr+1); }
    ww(addr, v) {
        this.wb(addr,v);
        this.wb(addr+1,v>>8);
    }

    read(address, size) {

        if (size === 1) return this.rb(address);
        else if (size === 2) return this.rw(address);
        return 0;
    }

    write(address, size, value) {

        if (size === 1) this.wb(address, value);
        else if (size === 2) this.ww(address, value);
    }

    fetch() {

        let address = this.seg.cs*16 + this.ip;
        this.ip = (this.ip + 1) & 0xffff;
        return this.rb(address);
    }

    fetch_signed() {

        let data = this.fetch();
        return data & 0x80 ? data - 256 : data;
    }

    fetch_word() {
        let l = this.fetch();
        return l + this.fetch()*256;
    }

    // Чтение 8 или 16 битного регистра
    get_reg(n, size) {

        if (size === 1) {

            switch (n) {

                case 0: return this.reg.ax & 0xff;
                case 1: return this.reg.cx & 0xff;
                case 2: return this.reg.dx & 0xff;
                case 3: return this.reg.bx & 0xff;
                case 4: return (this.reg.ax >> 8) & 0xff;
                case 5: return (this.reg.cx >> 8) & 0xff;
                case 6: return (this.reg.dx >> 8) & 0xff;
                case 7: return (this.reg.bx >> 8) & 0xff;
            }
        }
        else if (size === 2) {

            switch (n) {

                case 0: return this.reg.ax;
                case 1: return this.reg.cx;
                case 2: return this.reg.dx;
                case 3: return this.reg.bx;
                case 4: return this.reg.sp;
                case 5: return this.reg.bp;
                case 6: return this.reg.si;
                case 7: return this.reg.di;
            }
        }

        return 0;
    }

    // Запись в регистр 8 или 16 бит
    put_reg(n, size, data) {

        if (size === 1) {

            data &= 0xff;
            switch (n) {

                case 0: this.reg.ax = (this.reg.ax & 0xff00) | data; break;
                case 1: this.reg.cx = (this.reg.cx & 0xff00) | data; break;
                case 2: this.reg.dx = (this.reg.dx & 0xff00) | data; break;
                case 3: this.reg.bx = (this.reg.bx & 0xff00) | data; break;
                case 4: this.reg.ax = (this.reg.ax & 0x00ff) | data*256; break;
                case 5: this.reg.cx = (this.reg.cx & 0x00ff) | data*256; break;
                case 6: this.reg.dx = (this.reg.dx & 0x00ff) | data*256; break;
                case 7: this.reg.bx = (this.reg.bx & 0x00ff) | data*256; break;
            }
        }
        else if (size === 2) {

            data &= 0xffff;
            switch (n) {

                case 0: this.reg.ax = data; break;
                case 1: this.reg.cx = data; break;
                case 2: this.reg.dx = data; break;
                case 3: this.reg.bx = data; break;
                case 4: this.reg.sp = data; break;
                case 5: this.reg.bp = data; break;
                case 6: this.reg.si = data; break;
                case 7: this.reg.di = data; break;
            }
        }

        return 0;
    }

    get_segment(seg) {

        switch (seg) {
            case REG_ES: return this.seg.es;
            case REG_CS: return this.seg.cs;
            case REG_SS: return this.seg.ss;
            case REG_DS: return this.seg.ds;
        }

        return 0;
    }

    // Функции для дисплея
    // ---------------------------------------------------------------------

    // Копирует пиксельные данные из массива на канву
    flush() {
        this.canvas.ctx.putImageData(this.canvas.img, 0, 0);
    }

    // Наблюдатель изменений в картинке
    refresh() {

        if (this.canvas.refresh)
            this.flush();

        this.canvas.refresh = 0;
        setTimeout(function() { this.refresh(); }.bind(this), 25);
    }

    // Вывод точки в буфер
    pset(x, y, c) {

        this.canvas.refresh = 1;
        for (let i = 2*y; i <= 2*y + 1; i++)
        for (let j = 2*x; j <= 2*x + 1; j++) {

            if (j >= 0 && i >= 0 && j < this.canvas.w && i < this.canvas.h) {

                let p = 4*(j + i * this.canvas.w);
                this.canvas.img.data[p    ] =  (c >> 16) & 0xff;
                this.canvas.img.data[p + 1] =  (c >>  8) & 0xff;
                this.canvas.img.data[p + 2] =  (c      ) & 0xff;
                this.canvas.img.data[p + 3] = ((c >> 24) & 0xff) ^ 0xff;
            }
        }
    };

    // Печать одного символа
    update_text_byte(addr) {

        if (addr >= 0xb8000 && addr < 0xb8000 + 4000) {

            let old = addr & 0xFFFFE;
            addr -= 0xb8000;
            addr >>= 1;

            let x = addr % 80,
                y = Math.floor(addr / 80);

            x *= 8;
            y *= 16;

            let sym  = this.memory[old + 0];
            let attr = this.memory[old + 1];

            let fore = attr & 15;
            let back = attr >> 4;

            for (let i = 0; i < 16; i++) {

                let mask = font[sym][i];
                for (let j = 0; j < 8; j++) {

                    let cl = mask & (1 << (7-j)) ? fore : back;
                    this.pset(x + j, y + i, this.canvas.color[ cl&15 ]);
                }
            }
        }
    }
}
