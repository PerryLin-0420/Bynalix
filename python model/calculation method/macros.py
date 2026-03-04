from attrs import define, field

class macros():
    def carb_calories(self, carb):
        '''carb(g) \n
        return float'''
        return float(carb*4)
    
    def protein_calories(self, protein):
        '''protein(g) \n  
        return float'''
        return float(protein*4)
    
    def fat_calories(self, fat):
        '''fat(g) \n 
        return float'''
        return float(fat*9)