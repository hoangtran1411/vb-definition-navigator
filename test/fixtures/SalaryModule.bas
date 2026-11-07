Attribute VB_Name = "SalaryModule"
' Module tính tieàn löông nhân viên

' Function chính để tính tổng thu nhập
' Tieàn löông = baseSalary + bonus
Public Function CalculateSalary(ByVal empId As Long, _
                                ByVal bonusRate As Double) As Currency
    Dim baseSalary As Currency
    baseSalary = 1000
    CalculateSalary = baseSalary + (baseSalary * bonusRate)
End Function

Private Sub InternalHelper()
    ' Đoạn này không nên được gọi bên ngoài
End Sub

Public Property Get TotalEmployees() As Long
    TotalEmployees = 42
End Property
