# Model danych i uprawnień

Pełna definicja w `prisma/schema.prisma` — tu skrócony, czytelny opis dla osób
nietechnicznych.

## Encje

| Encja | Opis |
|---|---|
| `Clinic` | Przychodnia — klient B2B. Pole `isActive` pozwala zablokować całą przychodnię (np. po zakończeniu współpracy) bez usuwania historycznych danych. |
| `User` | Konto użytkownika — wewnętrzne (`INTERNAL_ADMIN`, `INTERNAL_STAFF`, bez przypisanej `Clinic`) lub zewnętrzne (`CLINIC_USER`, przypisane do jednej `Clinic`). |
| `Invoice` | Faktura wystawiona przychodni. |
| `InvoiceServiceItem` | Pozycja/zlecenie wchodzące w skład faktury — szczegóły usługi wykonanej dla konkretnego pacjenta. |
| `InvoiceAttachment` | Plik powiązany z fakturą (np. PDF faktury). |
| `UsgExam` | Badanie USG wykonane dla pacjenta danej przychodni — opis. |
| `UsgImage` | Plik (zdjęcie) powiązany z badaniem USG. |
| `AuditLog` | Niemodyfikowalny zapis zdarzeń bezpieczeństwa i dostępu do danych. |

## Role

| Rola | Kto | Co może |
|---|---|---|
| `INTERNAL_ADMIN` | Administrator po stronie Wykonawcy | Tworzy/blokuje/odblokowuje konta użytkowników klinik i personelu, nadaje/zmienia uprawnienia, tworzy konta przychodni, przegląda log audytowy, wprowadza faktury/USG (jak `INTERNAL_STAFF`). |
| `INTERNAL_STAFF` | Personel wewnętrzny wprowadzający dane | Wprowadza faktury, pozycje zleceń, wyniki USG, przesyła pliki. **Nie** zarządza kontami i nie widzi logu audytowego. |
| `CLINIC_USER` | Pracownik przychodni | Widzi wyłącznie dane **swojej** przychodni, w zakresie nadanych uprawnień (poniżej). |

## Uprawnienia użytkownika kliniki

Dwie niezależne flagi na koncie `CLINIC_USER`, nadawane przez `INTERNAL_ADMIN`:

| Flaga | Co odblokowuje |
|---|---|
| `canViewInvoices` | Lista i szczegóły faktur tej przychodni, pozycje zleceń, pobieranie załączników faktur. |
| `canViewUsg` | Lista i szczegóły badań USG tej przychodni, opisy, pobieranie obrazów. |

Możliwe kombinacje: tylko faktury, tylko USG, obie, albo żadna (konto istnieje,
ale nie ma dostępu do żadnych danych — przydatne np. w okresie przejściowym
przed formalnym potwierdzeniem zakresu dostępu przez przychodnię).

## Macierz dostępu (skrót)

| Zasób | `INTERNAL_ADMIN` | `INTERNAL_STAFF` | `CLINIC_USER` z `canViewInvoices` | `CLINIC_USER` z `canViewUsg` | `CLINIC_USER` bez uprawnień |
|---|---|---|---|---|---|
| Zarządzanie użytkownikami | ✅ | ❌ | ❌ | ❌ | ❌ |
| Log audytowy | ✅ | ❌ | ❌ | ❌ | ❌ |
| Wprowadzanie faktur/USG | ✅ | ✅ | ❌ | ❌ | ❌ |
| Podgląd faktur **własnej** przychodni | — | — | ✅ | ❌ | ❌ |
| Podgląd USG **własnej** przychodni | — | — | ❌ | ✅ | ❌ |
| Podgląd danych **innej** przychodni | ❌ | ❌ | ❌ (zawsze, niezależnie od flag) | ❌ | ❌ |

Blokada dostępu do danych innej przychodni jest wymuszana programowo
(`ClinicScopeGuard`) niezależnie od jakichkolwiek flag uprawnień — flagi
`canViewInvoices`/`canViewUsg` zawężają dostęp **w obrębie** własnej przychodni,
nigdy go nie rozszerzają poza nią.

## Blokowanie dostępu

`INTERNAL_ADMIN` może w każdej chwili ustawić `isActive = false` na koncie
użytkownika — natychmiastowo uniemożliwia to logowanie (a aktywne sesje są
unieważniane przy najbliższej weryfikacji uprawnień). Można też zablokować całą
przychodnię (`Clinic.isActive = false`) — blokuje to logowanie wszystkim
użytkownikom tej przychodni jednocześnie, np. po zakończeniu współpracy.
