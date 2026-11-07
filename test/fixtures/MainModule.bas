Attribute VB_Name = "MainModule"

Public Sub Main()
    Dim s As Currency
    ' Gọi hàm CalculateSalary ở đây:
    s = CalculateSalary(101, 0.15)
    
    ' Đây là comment chứa CalculateSalary không được tính là ref
    MsgBox "Chuỗi CalculateSalary cũng không được tính là ref"
    
    Call ExportPayrollData(s)
End Sub

Public Sub ExportPayrollData(ByVal amount As Currency)
    Dim bonus As Currency
    bonus = CalculateSalary(202, 0.2)
End Sub
