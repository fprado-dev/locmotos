# Locatário e condutor são a mesma entidade

O levantamento original previa locatário e condutor como cadastros separados, com a observação de que "o condutor pode ser diferente do locatário". No locmotos eles são **uma única entidade** (`Renter`): quem aluga é quem pilota, e é quem acessa o portal.

O perfil real do negócio — motoboy de aplicativo alugando a própria moto de trabalho — não produz essa separação. Modelar duas entidades criaria uma terceira audiência de autenticação e um relacionamento que nenhum caso de uso conhecido exercita.

## Consequências

O dia em que uma pessoa jurídica alugar e um funcionário pilotar, a mudança é um `driver_id` opcional na locação apontando para um `Renter` — não uma reescrita. Quem vier do levantamento original vai procurar a entidade `Driver` e não vai encontrar: é deliberado.
