
        org     7c00h

        ; 7c00 + 1be = 7DBEh
        ; [7c00 .. 7dff] 512
        ; [7e00 .. 7fff] 512
macro   brk     { xchg bx, bx }

; ----------------------------------------------------------------------
; 1 Найти раздел FAT32
; ----------------------------------------------------------------------

        cli
        cld
        xor     ax, ax
        mov     ds, ax
        mov     es, ax
        mov     ss, ax
        mov     sp, 7c00h
        mov     [diskdl], dl

        mov     si, 7DBEh
        mov     cx, 4
@@:     cmp     [si + 4], byte 0Bh
        je      load_fat32_boot
        add     si, 16
        loop    @b
        mov     si, err_pnot_found
        jmp     error

; ----------------------------------------------------------------------
load_fat32_boot:

        mov     eax, [si + 8]
        mov     [fat_start], eax
        mov     [DAP + 8], eax
        mov     ah, 42h
        mov     si, DAP
        int     13h
        mov     si, err_dap1
        jc      error

        ; Количество секторов на кластер
        mov     al, [7e00h + 0x0D]
        mov     [DAPCL + 2], al

        ; Начало раздела + количество резервированных секторов = начало FAT
        movzx   eax, word [7e00h + 0x0E]
        add     [fat_start], eax

        movzx   ebx, byte  [7e00h + 0x10] ; кол-во fat
        mov     ecx, dword [7e00h + 0x24] ; сколько секторов содержит fat
        imul    ebx, ecx
        mov     eax, [fat_start]
        add     eax, ebx
        mov     [cluster_start], eax

        ; Первый кластер
        mov     eax, [7e00h + 0x2C]

        ; Рассчитывается верхняя граница кластера
        mov     bp, [DAPCL + 2] ; размер кластера в секторах
        shl     bp, 9           ; bp = *512
        add     bp, 0x8000      ; конец кластера

        ; Читаем корневой каталог

next_cluster_root:

        call    read_cluster
        mov     si, 0x8000

search_name:

        push    si
        mov     di, filename
        mov     cx, 11+1
        rep     cmpsb
        pop     si
        and     cx, cx
        je      file_found
        add     si, 32
        cmp     si, bp
        jb      search_name

        ; загрузка следующего кластера
        call    get_next_cluster
        cmp     eax, 0x0FFFFFF0
        jb      next_cluster_root
        mov     si, err_notkernel
        jmp     error

file_found:

        ; Загрузка первого кластера
        mov     ax, [si + 0x14]
        shl     eax, 16
        mov     ax, [si + 0x1A]

next_cluster_data:

        ; Читаем кластер
        call    read_cluster
        call    get_next_cluster
        mov     bx, [DAPCL + 2]         ; Количество секторов на кластер
        shl     bx, 5                   ; 1 = 512 = 32
        add     [DAPCL + 6], bx
        cmp     eax, 0x0FFFFFF0
        jb      next_cluster_data

        ; Очистка перед запуском программы
        xor     ax, ax
        xor     bx, bx
        xor     cx, cx
        mov     dl, [diskdl]
        jmp     800h : 0                ; cs=800h, ds=0, es=0, ss=0, sp=7c00h

; eax - номер кластера [2...n]
read_cluster:

        push    eax si
        sub     eax, 2                  ; (cl-2)*sector_in_cluster + start_data
        movzx   ebx, word [DAPCL + 2]   ; количество секторов на кластер
        mul     ebx
        add     eax, [cluster_start]
        mov     [DAPCL + 8], eax        ; записывается номер сектора, где начинается кластер
        mov     ah, 42h
        mov     si, DAPCL
        mov     dl, [diskdl]
        int     13h
        mov     si, err_dap2
        jc      error
        pop     si eax
        ret

; eax - номер кластера
get_next_cluster:

        ; 4 байта = 1 элемент (1 кластер)
        push    eax
        mov     ebx, eax
        shr     ebx, 7              ; номер сектора fat32 = eax/128
        add     ebx, [fat_start]
        mov     [DAP + 8], ebx
        mov     ah, 42h
        mov     si, DAP
        mov     dl, [diskdl]
        int     13h
        pop     eax
        and     eax, 0x7F           ; 0..127
        mov     eax, [4*eax + 0x7E00]
        ret

; ----------------------------------------------------------------------
cluster_start   dd  0
fat_start       dd  0
filename        db  "KERNEL  BIN"
; ----------------------------------------------------------------------
err_pnot_found  db  "P404",0
err_dap1        db  "DAP1",0
err_dap2        db  "DAP2",0
err_notkernel   db  "NOKERN",0

error:  sti
        lodsb
        and     al, al
        je      $
        mov     ah, 0Eh
        int     10h
        jmp     error

diskdl: db      0

; Загрузка FAT
DAP:    db      10h         ; +0
        db      0           ; +1
        dw      1           ; +2 Count Sector
        dw      7e00h, 0    ; +4 Offset:Segment
        dd      0, 0        ; +8 LBA

; Загрузка кластера
DAPCL:  db      10h         ; +0
        db      0           ; +1
        dw      1           ; +2
        dw      0, 800h     ; +4 +6
        dd      0, 0        ; +8
