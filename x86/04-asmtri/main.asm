
            org     100h
macro       brk     { int3 }

SIZEOF_P3   equ     10          ; x,y,z,u,v

            ; DtxU => DeltaXUp
            ; DtX => DeltaX
            ; DtY => DeltaY
            ; IntX - LeftX|RightX
macro       increment IntX, DtxU, DtX, DtY {
            mov     ax, [DtxU]
            add     ax, [DtX]
            cwd
            idiv    [DtY]
            add     [IntX], ax
            mov     [DtxU], dx
@@:
}
            ; Старт программы
            mov     ax, $0013
            int     10h
            mov     ax, $A000
            mov     es, ax

            ; Передать массив из точек
            mov     si, PointArray
            call    RenderTriangle

            int     20h

; ----------------------------------------------------------------------
; Растеризация треугольника по трем вычисленными точкам в DS:SI
; ----------------------------------------------------------------------

RenderTriangle:

            ; Процедура сортировки точек
            ; for (i = 0;   i < 2; i++) si
            ; for (j = i+1; j < 3; j++) di
            push    si
            mov     cx, $0201
.fori:      lea     di, [si + SIZEOF_P3]
            inc     cl              ; cl=2, потом cl=1
.forj:      mov     ax, [si + 2]
            cmp     ax, [di + 2]    ; a[i].y <= a[j].y
            jle     @f
            ; =====
            xor     bx, bx
.swap:      mov     ax, [si+bx]       ; swap a[i], a[j]
            xchg    ax, [di+bx]
            xchg    ax, [si+bx]
            add     bx, 2
            cmp     bx, SIZEOF_P3
            jne     .swap
            ; =====
@@:         add     di, SIZEOF_P3   ; j++
            dec     cl
            jne     .forj
            add     si, SIZEOF_P3   ; i++
            dec     ch
            jne     .fori
            pop     si

            ; Вычисление главной стороны треугольника
            ; ----------------------------------------------------------
            mov     ax, [si+2+SIZEOF_P3*2]
            sub     ax, [si+2    ]
            mov     [.DeltaACY], ax     ; a[i+2].y - a[i].y
            je      .EndDraw            ; Пустой треугольник - это линия

            mov     ax, [si+SIZEOF_P3*2]
            sub     ax, [si]            ; a[i+2].x - a[i].x
            mov     [.DeltaACX], ax
            mov     ax, [si]
            mov     [.LeftX], ax        ; A.x
            mov     ax, [si+2]
            mov     [.CurrentY], ax     ; A.y
            mov     [.DeltaACXUp], word 0

            ; Растеризовать 2 половинки треугольника
            mov     bp, 2

.HalfTriangle:

            ; a[i+1].x - a[i].x
            mov     ax, [si+SIZEOF_P3]
            sub     ax, [si]
            mov     [.DeltaX], ax
            mov     [.DeltaXUp], word 0

            ; a[i+1].y - a[i].y
            mov     cx, [si+SIZEOF_P3+2]
            sub     cx, [si+2]
            mov     [.DeltaY], cx
            je      .HalfOut            ; Полутреугольник пуст

            mov     ax, [si]
            mov     [.RightX], ax       ; A.x или B.x

.RepeatLine:

            ; Не рисовать линию, если она за верхней границей экрана
            test    [.CurrentY], $8000
            jne     .NextLine

            ; Нарисовать линию от .LeftX до .RightX
            mov     ax, [.LeftX]
            mov     bx, [.RightX]
            mov     dx, 319             ; Правый край
            cmp     ax, bx
            jle     @f                  ; LeftX > RightX then SWAP
            xchg    ax, bx
@@:         cmp     ax, dx
            jg      .NextLine           ; x1 >= 320 (знаковый): пропуск
            jb      @f                  ; x1 < 0 then x1 = 0
            xor     ax, ax
            ; --- коррекция всех остальных значений
@@:         and     bx, bx
            js      .NextLine           ; x2 < 0 then skip
            cmp     bx, dx
            jbe     @f                  ; x2 >= 320 then x2=319
            mov     bx, dx

@@:         ; Отрисовка линии на экране
            imul    di, [.CurrentY], 320
            add     di, ax              ; di = ax + 320*Y
            sub     bx, ax
            inc     bx                  ; bx = сколько точек рисовать

            ; Процедура заполнения текстурой
.FillTex:   mov     al, 15              ; Пока что просто белый цвет
            stosb
            dec     bx
            jne     .FillTex

            ; К следующей линии
.NextLine:  increment .RightX, .DeltaXUp,   .DeltaX,   .DeltaY      ; AB/BC
            increment .LeftX,  .DeltaACXUp, .DeltaACX, .DeltaACY    ; AC

            inc     [.CurrentY]
            cmp     [.CurrentY], word 200   ; Вышли за нижний край
            jge     .EndDraw
            dec     cx
            jne    .RepeatLine

.HalfOut:   ; К следующему потреугольнику
            add     si, SIZEOF_P3
            dec     bp
            jne     .HalfTriangle

.EndDraw:   ret

; Временные значения
.LeftX      dw      0
.RightX     dw      0
.CurrentY   dw      0
.DeltaX     dw      0
.DeltaY     dw      0
.DeltaACX   dw      0
.DeltaACY   dw      0
.DeltaXUp   dw      0
.DeltaACXUp dw      0
; ----------------------------------------------------------------------

PointArray:

            ; px, py, z, u, v
            dw      -25,  275, 0, 0, 0
            dw      340,  50,  0, 0, 0
            dw      50,  -20,  0, 0, 0
